-- Fix: create_like_and_get_result — uniquement liker_id / liked_id (plus de branche from_user/to_user).
-- Symptôme corrigé : réciprocité jamais vue si les likes vivent en liker_id/liked_id alors que from_user existe encore en schéma.

DROP FUNCTION IF EXISTS public.create_like_and_get_result(uuid);

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
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_liked_id IS NULL OR p_liked_id = me THEN
    RAISE EXCEPTION 'Invalid liked user';
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
  'Like (liker_id/liked_id uniquement). Si réciproque : match LEAST/GREATEST + conversation, idempotent.';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid) TO authenticated;
