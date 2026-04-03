-- =============================================
-- SPLove — initiator_user sur matches + RPC create_like_and_get_result
-- =============================================
-- Schéma réel (projet) :
--   - public.matches : paire (user_a, user_b), PAS de colonne conversation_id
--     (voir 009_matches_rls, LikesYou.insert, Match.tsx : select id,user_a,user_b puis conversations à part)
--   - public.conversations : id = fil de discussion, match_id → matches(id)
--     (colonnes insert : sans status si absente en base — voir 027)
--
-- Erreur évitée : m.conversation_id n’existe pas sur matches.
-- conversation_id retourné au client = conversations.id (lookup ou INSERT après le match).

-- 1) Trigger : dernier filet si un INSERT omet encore initiator_user
CREATE OR REPLACE FUNCTION public.matches_fill_initiator_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.initiator_user IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.initiator_user := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_fill_initiator_user ON public.matches;
CREATE TRIGGER trg_matches_fill_initiator_user
BEFORE INSERT ON public.matches
FOR EACH ROW
EXECUTE PROCEDURE public.matches_fill_initiator_user();

COMMENT ON FUNCTION public.matches_fill_initiator_user() IS
  'Renseigne initiator_user à auth.uid() si NULL (2e like / inserts clients incomplets).';

-- 2) RPC : like + match réciproque — sans conversation_id sur matches
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

  -- Aligné LikesYou.tsx (status + expires_at) + initiator_user obligatoire
  INSERT INTO public.matches (id, user_a, user_b, initiator_user, status, expires_at)
  VALUES (
    mid,
    ua,
    ub,
    me,
    'active',
    NOW() + INTERVAL '48 hours'
  );

  -- Fil de discussion : uniquement colonnes présentes sur public.conversations (id, match_id)
  INSERT INTO public.conversations (id, match_id)
  VALUES (cid, mid);

  RETURN QUERY
  SELECT true, true, mid, cid;
END;
$$;

COMMENT ON FUNCTION public.create_like_and_get_result(uuid) IS
  'Like ; si réciproque, crée matches (sans conversation_id) + conversations (match_id), retourne conversations.id.';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid) TO authenticated;
