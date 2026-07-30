-- iOS push complet : Play, activités, badge icône, métadonnées payload, déduplication côté Edge.

-- ---------------------------------------------------------------------------
-- Compteur badge icône = cloche non lue + conversations avec messages non lus.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_icon_badge_count(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bell int := 0;
  v_inbox int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF to_regclass('public.in_app_notifications') IS NOT NULL THEN
    SELECT count(*)::int
    INTO v_bell
    FROM public.in_app_notifications n
    WHERE n.user_id = p_user_id
      AND n.read IS NOT TRUE
      AND n.kind IN (
        'new_like', 'play_sent', 'new_match', 'new_message',
        'activity_proposed', 'activity_accepted', 'activity_counter', 'meetup_confirmed'
      );
  END IF;

  IF to_regclass('public.messages') IS NOT NULL
     AND to_regclass('public.conversations') IS NOT NULL
     AND to_regclass('public.matches') IS NOT NULL THEN
    SELECT count(DISTINCT m.conversation_id)::int
    INTO v_inbox
    FROM public.messages m
    INNER JOIN public.conversations c ON c.id = m.conversation_id
    INNER JOIN public.matches mt ON mt.id = c.match_id
    WHERE (mt.user_a = p_user_id OR mt.user_b = p_user_id)
      AND m.sender_id IS DISTINCT FROM p_user_id
      AND m.read_at IS NULL;
  END IF;

  RETURN coalesce(v_bell, 0) + coalesce(v_inbox, 0);
END;
$$;

COMMENT ON FUNCTION public.splove_icon_badge_count(uuid) IS
  'Badge icône iOS/Android : notifications cloche non lues + conversations avec messages non lus.';

REVOKE ALL ON FUNCTION public.splove_icon_badge_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_icon_badge_count(uuid) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_dispatch_push_notification(
  p_recipient_user_id uuid,
  p_kind text,
  p_route text,
  p_conversation_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_play_type text DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text;
  v_secret text;
  v_push_env text;
  v_body jsonb;
BEGIN
  IF p_recipient_user_id IS NULL OR btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_route, '')) = '' THEN
    RETURN;
  END IF;

  SELECT s.functions_base_url, s.webhook_secret, s.push_environment
  INTO v_base_url, v_secret, v_push_env
  FROM public.push_webhook_settings s
  WHERE s.id = 1;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
    RETURN;
  END IF;

  IF v_push_env IS NULL OR btrim(v_push_env) = '' THEN
    v_push_env := 'production';
  END IF;

  v_body := jsonb_build_object(
    'recipientUserId', p_recipient_user_id,
    'kind', btrim(p_kind),
    'route', btrim(p_route),
    'conversationId', p_conversation_id,
    'pushEnvironment', v_push_env,
    'triggerSource', 'sql_trigger'
  );

  IF p_actor_id IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('actorId', p_actor_id, 'profileId', p_actor_id);
  END IF;
  IF p_play_type IS NOT NULL AND btrim(p_play_type) <> '' THEN
    v_body := v_body || jsonb_build_object('playType', btrim(p_play_type));
  END IF;
  IF p_proposal_id IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('proposalId', p_proposal_id);
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_base_url, '/') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Splove-Push-Secret', v_secret
    ),
    body := v_body
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[splove_dispatch_push_notification] kind=% recipient=% err=%',
      p_kind, p_recipient_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.splove_dispatch_push_notification(uuid, text, text, uuid, uuid, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Like classique → push (Play premium géré par RPC create_like).
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

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'play_type'
  ) AND NEW.play_type IS NOT NULL THEN
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

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'splove_dispatch_push_notification'
  ) THEN
    PERFORM public.splove_dispatch_push_notification(v_to, 'like', '/likes-you', NULL, v_from, NULL, NULL);
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Match → push avec conversation + acteur.
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
  v_actor uuid;
  v_name text;
  v_route text;
BEGIN
  SELECT c.id INTO v_cid
  FROM public.conversations c
  WHERE c.match_id = NEW.id
  ORDER BY c.created_at ASC NULLS LAST
  LIMIT 1;

  v_route := CASE
    WHEN v_cid IS NOT NULL THEN '/match/' || v_cid::text
    ELSE '/messages'
  END;

  FOR v_peer IN SELECT unnest(ARRAY[NEW.user_a, NEW.user_b]) LOOP
    IF v_peer IS NULL THEN
      CONTINUE;
    END IF;
    v_actor := CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END;
    v_name := public.splove_profile_first_name(v_actor);
    PERFORM public.splove_upsert_notification(
      v_peer,
      'new_match',
      'new_match:' || NEW.id::text || ':' || v_peer::text,
      jsonb_build_object(
        'route', v_route,
        'conversation_id', v_cid,
        'match_id', NEW.id,
        'actor_id', v_actor,
        'actor_name', v_name
      ),
      true
    );

    PERFORM public.splove_dispatch_push_notification(v_peer, 'match', v_route, v_cid, v_actor, NULL, NULL);
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Message chat → push (hors propositions d'activité).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_splove_push_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer uuid;
  v_mt text;
  v_route text;
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

  v_route := '/chat/' || NEW.conversation_id::text;
  PERFORM public.splove_dispatch_push_notification(
    v_peer, 'message', v_route, NEW.conversation_id, NEW.sender_id, NULL, NULL
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Activités → push natif (proposition, contre-proposition, acceptation, meetup).
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
  v_route text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id);
    IF v_peer IS NULL OR v_peer = NEW.proposer_id THEN
      RETURN NEW;
    END IF;

    v_name := public.splove_profile_first_name(NEW.proposer_id);
    v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');
    v_route := '/chat/' || NEW.conversation_id::text;

    IF NEW.counter_of IS NOT NULL THEN
      PERFORM public.splove_upsert_notification(
        v_peer,
        'activity_counter',
        'activity_counter:' || NEW.id::text,
        jsonb_build_object(
          'route', v_route,
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
      PERFORM public.splove_dispatch_push_notification(
        v_peer, 'activity_counter', v_route, NEW.conversation_id, NEW.proposer_id, NULL, NEW.id
      );
    ELSE
      PERFORM public.splove_upsert_notification(
        v_peer,
        'activity_proposed',
        'activity_proposed:' || NEW.id::text,
        jsonb_build_object(
          'route', v_route,
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
      PERFORM public.splove_dispatch_push_notification(
        v_peer, 'activity_proposed', v_route, NEW.conversation_id, NEW.proposer_id, NULL, NEW.id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_status := lower(coalesce(OLD.status, ''));
    v_new_status := lower(coalesce(NEW.status, ''));
    v_old_meetup := OLD.meetup_confirmation;
    v_new_meetup := NEW.meetup_confirmation;
    v_route := '/chat/' || NEW.conversation_id::text;

    IF v_new_status = 'accepted' AND v_old_status IS DISTINCT FROM 'accepted' THEN
      v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id);
      IF v_peer IS NOT NULL AND NEW.proposer_id IS NOT NULL AND NEW.proposer_id <> v_peer THEN
        v_name := public.splove_profile_first_name(v_peer);
        v_place := COALESCE(NULLIF(TRIM(NEW.place), ''), NULLIF(TRIM(NEW.location), ''), '');
        PERFORM public.splove_upsert_notification(
          NEW.proposer_id,
          'activity_accepted',
          'activity_accepted:' || NEW.id::text,
          jsonb_build_object(
            'route', v_route,
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
        PERFORM public.splove_dispatch_push_notification(
          NEW.proposer_id, 'activity_accepted', v_route, NEW.conversation_id, v_peer, NULL, NEW.id
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
        PERFORM public.splove_dispatch_push_notification(
          v_peer,
          'meetup_confirmed',
          '/mes-rencontres?tab=confirmed',
          NEW.conversation_id,
          CASE WHEN v_peer = NEW.proposer_id
            THEN public.splove_conversation_peer(NEW.conversation_id, NEW.proposer_id)
            ELSE NEW.proposer_id
          END,
          NULL,
          NEW.id
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC like — push Play premium.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_like_and_get_result(
  p_liked_id uuid,
  p_play_type text DEFAULT NULL
)
RETURNS TABLE (
  like_created boolean,
  is_match boolean,
  match_id uuid,
  conversation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  reciprocal boolean := false;
  ua uuid;
  ub uuid;
  mid uuid;
  cid uuid;
  me_profile_json jsonb;
  me_profile_completed boolean;
  me_is_active boolean;
  me_is_paused boolean;
  me_is_banned boolean;
  me_deleted_at text;
  v_play text;
  v_prev_play text;
  v_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_liked_id IS NULL OR p_liked_id = me THEN
    RAISE EXCEPTION 'Invalid liked user';
  END IF;

  v_play := lower(trim(coalesce(p_play_type, 'classic')));
  IF v_play NOT IN ('classic', 'warmup', 'training', 'match', 'victory') THEN
    v_play := 'classic';
  END IF;

  SELECT to_jsonb(p)
  INTO me_profile_json
  FROM public.profiles p
  WHERE p.id = me;

  me_profile_completed := COALESCE((me_profile_json ->> 'profile_completed')::boolean, false);
  me_is_active := COALESCE((me_profile_json ->> 'is_active')::boolean, true);
  me_is_paused := COALESCE((me_profile_json ->> 'is_paused')::boolean, false);
  me_is_banned := COALESCE((me_profile_json ->> 'is_banned')::boolean, false);
  me_deleted_at := NULLIF(COALESCE(me_profile_json ->> 'deleted_at', ''), '');

  IF me_profile_json IS NULL
     OR me_profile_completed IS DISTINCT FROM true
     OR me_is_active IS DISTINCT FROM true
     OR me_is_paused IS DISTINCT FROM false
     OR me_is_banned IS DISTINCT FROM false
     OR me_deleted_at IS NOT NULL
  THEN
    RAISE LOG '[LIKE_BLOCKED_PROFILE_INVALID] liker_id=%, profile_completed=%, is_active=%, is_paused=%, is_banned=%, deleted_at=%',
      me,
      me_profile_completed,
      me_is_active,
      me_is_paused,
      me_is_banned,
      me_deleted_at;

    RAISE EXCEPTION USING
      MESSAGE = 'PROFILE_NOT_ALLOWED',
      ERRCODE = 'P0001';
  END IF;

  SELECT l.play_type
  INTO v_prev_play
  FROM public.likes l
  WHERE l.liker_id = me
    AND l.liked_id = p_liked_id;

  IF v_play = 'classic' THEN
    INSERT INTO public.likes (liker_id, liked_id)
    VALUES (me, p_liked_id)
    ON CONFLICT (liker_id, liked_id) DO NOTHING;
  ELSE
    INSERT INTO public.likes (liker_id, liked_id, play_type)
    VALUES (me, p_liked_id, v_play)
    ON CONFLICT (liker_id, liked_id) DO UPDATE SET
      play_type = EXCLUDED.play_type
    WHERE public.likes.play_type IS DISTINCT FROM EXCLUDED.play_type;
  END IF;

  IF v_play IS DISTINCT FROM 'classic' AND (v_prev_play IS NULL OR v_prev_play IS DISTINCT FROM v_play) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.likes
      WHERE liker_id = p_liked_id
        AND liked_id = me
    )
    INTO reciprocal;

    IF NOT reciprocal THEN
      v_name := public.splove_profile_first_name(me);
      PERFORM public.splove_upsert_notification(
        p_liked_id,
        'play_sent',
        'play_sent:' || me::text || ':' || v_play,
        jsonb_build_object(
          'route', '/likes-you',
          'actor_id', me,
          'actor_name', v_name,
          'play_type', v_play
        ),
        true
      );
      IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'splove_dispatch_push_notification'
      ) THEN
        PERFORM public.splove_dispatch_push_notification(
          p_liked_id, 'play_sent', '/likes-you', NULL, me, v_play, NULL
        );
      END IF;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.likes
    WHERE liker_id = p_liked_id
      AND liked_id = me
  )
  INTO reciprocal;

  IF NOT reciprocal THEN
    RETURN QUERY
    SELECT true, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  ua := LEAST(me, p_liked_id);
  ub := GREATEST(me, p_liked_id);

  INSERT INTO public.matches (id, user_a, user_b, initiator_user, status, expires_at)
  VALUES (gen_random_uuid(), ua, ub, me, 'active', NOW() + INTERVAL '48 hours')
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT m.id
  INTO mid
  FROM public.matches m
  WHERE m.user_a = ua
    AND m.user_b = ub
  LIMIT 1;

  SELECT c.id
  INTO cid
  FROM public.conversations c
  WHERE c.match_id = mid
  LIMIT 1;

  IF cid IS NULL THEN
    cid := gen_random_uuid();
    INSERT INTO public.conversations (id, match_id)
    VALUES (cid, mid);
  END IF;

  RETURN QUERY
  SELECT true, true, mid, cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid, text) TO authenticated;
