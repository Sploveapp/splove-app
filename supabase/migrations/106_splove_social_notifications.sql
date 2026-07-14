-- SPLove — notifications sociales (likes, matchs, messages, activités)
-- Phase 1 : in-app uniquement, déduplication, deep links via payload JSON.

ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

COMMENT ON COLUMN public.in_app_notifications.payload IS
  'Métadonnées deep link : actor_name, conversation_id, route, sport, place, etc.';

COMMENT ON COLUMN public.in_app_notifications.dedupe_key IS
  'Clé idempotente par utilisateur (ex. new_message:<msg_id>).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_notifications_user_dedupe
  ON public.in_app_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_profile_first_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(TRIM(p.first_name), ''), 'Quelqu''un')
  FROM public.profiles p
  WHERE p.id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.splove_profile_first_name(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_conversation_peer(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN m.user_a = p_user_id THEN m.user_b
    WHEN m.user_b = p_user_id THEN m.user_a
    ELSE NULL::uuid
  END
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = p_conversation_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.splove_conversation_peer(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_upsert_notification(
  p_user_id uuid,
  p_kind text,
  p_dedupe_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_exempt_daily_cap boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent int := 0;
  v_kind text := btrim(coalesce(p_kind, ''));
BEGIN
  IF p_user_id IS NULL OR v_kind = '' THEN
    RETURN;
  END IF;

  IF NOT COALESCE(p_exempt_daily_cap, true) THEN
    SELECT COUNT(*)::int INTO v_sent
    FROM public.in_app_notifications n
    WHERE n.user_id = p_user_id
      AND COALESCE(n.exempt_daily_cap, false) = false
      AND (n.created_at AT TIME ZONE 'UTC')::date = (timezone('utc', now()))::date;

    IF v_sent >= 1 THEN
      RETURN;
    END IF;
  END IF;

  IF p_dedupe_key IS NOT NULL AND btrim(p_dedupe_key) <> '' THEN
    INSERT INTO public.in_app_notifications (
      user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key
    )
    VALUES (
      p_user_id,
      v_kind,
      '',
      '',
      false,
      COALESCE(p_exempt_daily_cap, true),
      COALESCE(p_payload, '{}'::jsonb),
      btrim(p_dedupe_key)
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
    DO UPDATE SET
      kind = EXCLUDED.kind,
      payload = EXCLUDED.payload,
      read = false,
      created_at = timezone('utc', now());
    RETURN;
  END IF;

  INSERT INTO public.in_app_notifications (
    user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key
  )
  VALUES (
    p_user_id,
    v_kind,
    '',
    '',
    false,
    COALESCE(p_exempt_daily_cap, true),
    COALESCE(p_payload, '{}'::jsonb),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_reciprocal boolean := false;
  v_name text;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'from_user'
    ) THEN
      v_from := NEW.from_user;
      v_to := NEW.to_user;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.from_user = v_to AND l.to_user = v_from
      ) INTO v_reciprocal;
    ELSE
      v_from := NEW.liker_id;
      v_to := NEW.liked_id;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.liker_id = v_to AND l.liked_id = v_from
      ) INTO v_reciprocal;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_to IS NULL OR v_from IS NULL OR v_reciprocal THEN
    RETURN NEW;
  END IF;

  v_name := public.splove_profile_first_name(v_from);

  PERFORM public.splove_upsert_notification(
    v_to,
    'new_like',
    'new_like:' || v_from::text || ':' || NEW.id::text,
    jsonb_build_object(
      'route', '/likes-you',
      'actor_id', v_from,
      'actor_name', v_name
    ),
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_splove_notify_new_like ON public.likes;
CREATE TRIGGER tr_splove_notify_new_like
  AFTER INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_splove_notify_new_like();

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_peer uuid;
  v_name text;
BEGIN
  SELECT c.id INTO v_cid
  FROM public.conversations c
  WHERE c.match_id = NEW.id
  ORDER BY c.created_at ASC NULLS LAST
  LIMIT 1;

  FOR v_peer IN SELECT unnest(ARRAY[NEW.user_a, NEW.user_b]) LOOP
    IF v_peer IS NULL THEN
      CONTINUE;
    END IF;
    v_name := public.splove_profile_first_name(
      CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END
    );
    PERFORM public.splove_upsert_notification(
      v_peer,
      'new_match',
      'new_match:' || NEW.id::text || ':' || v_peer::text,
      jsonb_build_object(
        'route', CASE WHEN v_cid IS NOT NULL THEN '/match/' || v_cid::text ELSE '/messages' END,
        'conversation_id', v_cid,
        'match_id', NEW.id,
        'actor_id', CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END,
        'actor_name', v_name
      ),
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_splove_notify_new_match ON public.matches;
CREATE TRIGGER tr_splove_notify_new_match
  AFTER INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_splove_notify_new_match();

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer uuid;
  v_name text;
  v_mt text;
BEGIN
  IF to_regclass('public.messages') IS NULL THEN
    RETURN NEW;
  END IF;

  v_mt := lower(coalesce(NEW.message_type, 'text'));
  IF v_mt IN ('activity_proposal', 'activity_proposal_response') THEN
    RETURN NEW;
  END IF;

  v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.sender_id);
  IF v_peer IS NULL OR v_peer = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_name := public.splove_profile_first_name(NEW.sender_id);

  PERFORM public.splove_upsert_notification(
    v_peer,
    'new_message',
    'new_message:' || NEW.id::text,
    jsonb_build_object(
      'route', '/chat/' || NEW.conversation_id::text,
      'conversation_id', NEW.conversation_id,
      'actor_id', NEW.sender_id,
      'actor_name', v_name
    ),
    true
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS tr_splove_notify_new_message ON public.messages;
    CREATE TRIGGER tr_splove_notify_new_message
      AFTER INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.tr_splove_notify_new_message();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_splove_notify_activity_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer uuid;
  v_name text;
  v_place text;
  v_old_status text;
  v_new_status text;
  v_old_meetup jsonb;
  v_new_meetup jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id);
    IF v_peer IS NULL THEN
      RETURN NEW;
    END IF;

    v_name := public.splove_profile_first_name(NEW.proposer_id);
    v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');

    IF NEW.counter_of IS NOT NULL THEN
      PERFORM public.splove_upsert_notification(
        v_peer,
        'activity_counter',
        'activity_counter:' || NEW.id::text,
        jsonb_build_object(
          'route', '/chat/' || NEW.conversation_id::text,
          'conversation_id', NEW.conversation_id,
          'proposal_id', NEW.id,
          'actor_id', NEW.proposer_id,
          'actor_name', v_name,
          'sport', NEW.sport,
          'place', v_place,
          'scheduled_at', NEW.scheduled_at
        ),
        true
      );
    ELSE
      PERFORM public.splove_upsert_notification(
        v_peer,
        'activity_proposed',
        'activity_proposed:' || NEW.id::text,
        jsonb_build_object(
          'route', '/chat/' || NEW.conversation_id::text,
          'conversation_id', NEW.conversation_id,
          'proposal_id', NEW.id,
          'actor_id', NEW.proposer_id,
          'actor_name', v_name,
          'sport', NEW.sport,
          'place', v_place,
          'scheduled_at', NEW.scheduled_at
        ),
        true
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_status := lower(coalesce(OLD.status, ''));
    v_new_status := lower(coalesce(NEW.status, ''));
    v_old_meetup := OLD.meetup_confirmation;
    v_new_meetup := NEW.meetup_confirmation;

    IF v_new_status = 'accepted' AND v_old_status IS DISTINCT FROM 'accepted' THEN
      v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id);
      IF v_peer IS NOT NULL THEN
        v_name := public.splove_profile_first_name(v_peer);
        v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');
        PERFORM public.splove_upsert_notification(
          NEW.proposer_id,
          'activity_accepted',
          'activity_accepted:' || NEW.id::text,
          jsonb_build_object(
            'route', '/chat/' || NEW.conversation_id::text,
            'conversation_id', NEW.conversation_id,
            'proposal_id', NEW.id,
            'actor_id', v_peer,
            'actor_name', v_name,
            'sport', NEW.sport,
            'place', v_place,
            'scheduled_at', NEW.scheduled_at
          ),
          true
        );
      END IF;
    END IF;

    IF v_new_meetup IS DISTINCT FROM v_old_meetup
       AND coalesce(v_new_meetup->>'status', '') = 'confirmed' THEN
      FOR v_peer IN
        SELECT public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id)
        UNION
        SELECT NEW.proposer_id
      LOOP
        IF v_peer IS NULL THEN
          CONTINUE;
        END IF;
        v_name := public.splove_profile_first_name(
          CASE WHEN v_peer = NEW.proposer_id
            THEN public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id)
            ELSE NEW.proposer_id
          END
        );
        PERFORM public.splove_upsert_notification(
          v_peer,
          'meetup_confirmed',
          'meetup_confirmed:' || NEW.id::text || ':' || v_peer::text,
          jsonb_build_object(
            'route', '/mes-rencontres?tab=confirmed',
            'conversation_id', NEW.conversation_id,
            'proposal_id', NEW.id,
            'actor_id', CASE WHEN v_peer = NEW.proposer_id
              THEN public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id)
              ELSE NEW.proposer_id
            END,
            'actor_name', v_name,
            'sport', COALESCE(v_new_meetup->>'sport', NEW.sport),
            'place', COALESCE(v_new_meetup->>'location', NEW.place)
          ),
          true
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_splove_notify_activity_proposal ON public.activity_proposals;
CREATE TRIGGER tr_splove_notify_activity_proposal
  AFTER INSERT OR UPDATE ON public.activity_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_splove_notify_activity_proposal();
