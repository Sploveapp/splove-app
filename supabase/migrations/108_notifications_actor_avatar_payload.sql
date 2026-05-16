-- Payload notifications : actor_id, actor_name, actor_avatar (en plus des champs route / ids).

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
  v_actor jsonb;
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

  v_actor := public.splove_notification_actor_payload(v_from);

  PERFORM public.splove_upsert_notification(
    v_to,
    'new_like',
    'new_like:' || v_from::text || ':' || NEW.id::text,
    v_actor || jsonb_build_object('route', '/likes-you'),
    true
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_peer uuid;
  v_other uuid;
  v_actor jsonb;
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
    v_other := CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END;
    v_actor := public.splove_notification_actor_payload(v_other);
    PERFORM public.splove_upsert_notification(
      v_peer,
      'new_match',
      'new_match:' || NEW.id::text || ':' || v_peer::text,
      v_actor || jsonb_build_object(
        'route', CASE WHEN v_cid IS NOT NULL THEN '/match/' || v_cid::text ELSE '/messages' END,
        'conversation_id', v_cid,
        'match_id', NEW.id
      ),
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_splove_notify_activity_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer uuid;
  v_other uuid;
  v_actor jsonb;
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

    v_actor := public.splove_notification_actor_payload(NEW.proposer_id);
    v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');

    IF NEW.counter_of IS NOT NULL THEN
      PERFORM public.splove_upsert_notification(
        v_peer,
        'activity_counter',
        'activity_counter:' || NEW.id::text,
        v_actor || jsonb_build_object(
          'route', '/chat/' || NEW.conversation_id::text,
          'conversation_id', NEW.conversation_id,
          'proposal_id', NEW.id,
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
        v_actor || jsonb_build_object(
          'route', '/chat/' || NEW.conversation_id::text,
          'conversation_id', NEW.conversation_id,
          'proposal_id', NEW.id,
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
        v_actor := public.splove_notification_actor_payload(v_peer);
        v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');
        PERFORM public.splove_upsert_notification(
          NEW.proposer_id,
          'activity_accepted',
          'activity_accepted:' || NEW.id::text,
          v_actor || jsonb_build_object(
            'route', '/chat/' || NEW.conversation_id::text,
            'conversation_id', NEW.conversation_id,
            'proposal_id', NEW.id,
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
        v_other := CASE
          WHEN v_peer = NEW.proposer_id
            THEN public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id)
          ELSE NEW.proposer_id
        END;
        v_actor := public.splove_notification_actor_payload(v_other);
        PERFORM public.splove_upsert_notification(
          v_peer,
          'meetup_confirmed',
          'meetup_confirmed:' || NEW.id::text || ':' || v_peer::text,
          v_actor || jsonb_build_object(
            'route', '/mes-rencontres?tab=confirmed',
            'conversation_id', NEW.conversation_id,
            'proposal_id', NEW.id,
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
