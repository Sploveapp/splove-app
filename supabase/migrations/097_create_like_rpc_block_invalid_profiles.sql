-- Hard guard: block likes from invalid/incomplete profiles before any write.
-- Returns explicit business error: PROFILE_NOT_ALLOWED

CREATE OR REPLACE FUNCTION public.create_like_and_get_result(p_liked_id uuid)
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
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_liked_id IS NULL OR p_liked_id = me THEN
    RAISE EXCEPTION 'Invalid liked user';
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

  INSERT INTO public.likes (liker_id, liked_id)
  VALUES (me, p_liked_id)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

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

  INSERT INTO public.matches (id, user_a, user_b, initiator_user)
  VALUES (gen_random_uuid(), ua, ub, me)
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

COMMENT ON FUNCTION public.create_like_and_get_result(uuid) IS
  'Like RPC with strict profile guard (PROFILE_NOT_ALLOWED) before any write.';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid) TO authenticated;
