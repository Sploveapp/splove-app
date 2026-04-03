-- Final fix: create_like_and_get_result aligned with real public.matches / public.conversations (no rewrite of prior migrations).

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
  has_from_to boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_liked_id IS NULL OR p_liked_id = me THEN
    RAISE EXCEPTION 'Invalid liked user';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'from_user'
  )
  INTO has_from_to;

  IF has_from_to THEN
    INSERT INTO public.likes (from_user, to_user)
    VALUES (me, p_liked_id)
    ON CONFLICT (from_user, to_user) DO NOTHING;

    SELECT EXISTS (
      SELECT 1
      FROM public.likes
      WHERE from_user = p_liked_id
        AND to_user = me
    )
    INTO reciprocal;
  ELSE
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
  END IF;

  IF NOT reciprocal THEN
    RETURN QUERY
    SELECT true, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  ua := LEAST(me, p_liked_id);
  ub := GREATEST(me, p_liked_id);

  SELECT m.id
  INTO mid
  FROM public.matches m
  WHERE m.user_a = ua
    AND m.user_b = ub
  LIMIT 1;

  IF mid IS NOT NULL THEN
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
    RETURN;
  END IF;

  mid := gen_random_uuid();
  cid := gen_random_uuid();

  INSERT INTO public.matches (id, user_a, user_b, initiator_user)
  VALUES (mid, ua, ub, me);

  INSERT INTO public.conversations (id, match_id)
  VALUES (cid, mid);

  RETURN QUERY
  SELECT true, true, mid, cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid) TO authenticated;
