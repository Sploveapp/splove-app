-- SPLove — matches.expires_at obligatoire : défaut + trigger + RPC create_like alignée (025).

-- 1) Backfill lignes existantes
UPDATE public.matches
SET expires_at = COALESCE(created_at, NOW()) + INTERVAL '48 hours'
WHERE expires_at IS NULL;

-- 2) Défaut colonne (INSERT sans valeur explicite)
ALTER TABLE public.matches
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '48 hours');

-- 3) Filet trigger (clients / RPC incomplets)
CREATE OR REPLACE FUNCTION public.matches_fill_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_fill_expires_at ON public.matches;
CREATE TRIGGER trg_matches_fill_expires_at
BEFORE INSERT ON public.matches
FOR EACH ROW
EXECUTE PROCEDURE public.matches_fill_expires_at();

COMMENT ON FUNCTION public.matches_fill_expires_at() IS
  'Renseigne expires_at à now()+48h si NULL (évite NOT NULL sur matches).';

-- 4) RPC like — expires_at explicite (même fenêtre 48h que 025)
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
  'Like RPC avec SPLove Play ; match réciproque avec expires_at (48h).';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid, text) TO authenticated;
