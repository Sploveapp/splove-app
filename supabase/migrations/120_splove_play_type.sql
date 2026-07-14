-- SPLove Play — intention au like (classic | warmup | training | match | victory)

ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS play_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'likes_play_type_check'
      AND conrelid = 'public.likes'::regclass
  ) THEN
    ALTER TABLE public.likes
      ADD CONSTRAINT likes_play_type_check
      CHECK (
        play_type IS NULL
        OR play_type IN ('classic', 'warmup', 'training', 'match', 'victory')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.likes.play_type IS
  'SPLove Play : classic | warmup | training | match | victory (NULL = classique historique)';

-- Catalogue Pack Play (monétisation future — aucun paiement branché)
INSERT INTO public.features (key, label, description, category, is_active)
VALUES (
  'play_pack',
  'Pack Play',
  'Envoi et lecture des Plays SPLove (achat unique)',
  'engagement',
  true
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;
  

-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_like_and_get_result(uuid);
DROP FUNCTION IF EXISTS public.create_like_and_get_result(uuid, text);

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

  -- Classique : comportement historique (ON CONFLICT DO NOTHING, created_at inchangé).
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

  -- Notification Play (préparation — affichage i18n côté app)
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

  IF mid IS NULL THEN
    RETURN QUERY
    SELECT true, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

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

COMMENT ON FUNCTION public.create_like_and_get_result(uuid, text) IS
  'Like RPC avec SPLove Play optionnel ; remplace le play existant sur conflit.';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Éviter double notif : Play premium → play_sent (RPC) uniquement, pas new_like trigger.
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
    PERFORM public.splove_dispatch_push_notification(v_to, 'like', '/likes-you', NULL);
  END IF;

  RETURN NEW;
END;
$$;
