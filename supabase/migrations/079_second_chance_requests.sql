-- Second Chance: one message after a pass swipe, recipient can accept (creates match) or ignore.
-- Prérequis: discover_swipe_events (077), discover_user_has_splove_plus, profile_pair_is_blocked, matches, likes, conversations

-- ---------------------------------------------------------------------------
-- 1) Crédits (consommés si pas SPLove+)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS second_chance_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.second_chance_credits IS
  'Crédits Seconde chance (hors abonnement SPLove+ / parrainage).';

-- ---------------------------------------------------------------------------
-- 2) Table demandes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.second_chance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  result_match_id uuid REFERENCES public.matches (id) ON DELETE SET NULL,
  result_conversation_id uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  CONSTRAINT second_chance_no_self CHECK (sender_id <> recipient_id),
  CONSTRAINT second_chance_message_len CHECK (char_length(message) >= 1 AND char_length(message) <= 200),
  CONSTRAINT second_chance_unique_pair UNIQUE (sender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_second_chance_recipient_pending
  ON public.second_chance_requests (recipient_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_second_chance_sender
  ON public.second_chance_requests (sender_id, created_at DESC);

COMMENT ON TABLE public.second_chance_requests IS
  'Une demande de seconde chance par couple expéditeur/destinataire ; pas de chat tant que non acceptée.';

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.second_chance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "second_chance_select_involved" ON public.second_chance_requests;
CREATE POLICY "second_chance_select_involved"
  ON public.second_chance_requests FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Pas d'INSERT/UPDATE direct côté client (RPC SECURITY DEFINER)

-- ---------------------------------------------------------------------------
-- 4) Valider le texte (anti-lien simple côté serveur)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.second_chance_message_is_valid(p_message text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    length(trim(p_message)) BETWEEN 1 AND 200
    AND lower(p_message) !~* 'https?://'
    AND lower(p_message) !~* 'www\.'
    AND position(E'\n' IN p_message) = 0
    AND position(E'\r' IN p_message) = 0;
$$;

-- ---------------------------------------------------------------------------
-- 5) Créer une demande
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_second_chance_request(p_recipient_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_trim text;
  v_has_plus boolean;
  v_credits integer;
  v_req_id uuid;
  v_row public.second_chance_requests%ROWTYPE;
  ua uuid;
  ub uuid;
  v_pass boolean;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_recipient_id IS NULL OR p_recipient_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_recipient');
  END IF;
  IF public.profile_pair_is_blocked(v_me, p_recipient_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  v_trim := trim(p_message);
  IF NOT public.second_chance_message_is_valid(v_trim) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_message');
  END IF;

  -- Preuve d'un swipe « pass » vers ce profil
  SELECT EXISTS (
    SELECT 1
    FROM public.discover_swipe_events d
    WHERE d.viewer_id = v_me
      AND d.target_id = p_recipient_id
      AND d.action = 'pass'
  )
  INTO v_pass;
  IF NOT v_pass THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pass_swipe_required');
  END IF;

  ua := LEAST(v_me, p_recipient_id);
  ub := GREATEST(v_me, p_recipient_id);
  IF EXISTS (SELECT 1 FROM public.matches m WHERE m.user_a = ua AND m.user_b = ub) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_matched');
  END IF;

  SELECT * INTO v_row
  FROM public.second_chance_requests
  WHERE sender_id = v_me AND recipient_id = p_recipient_id;

  IF FOUND THEN
    IF v_row.status = 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_pending', 'request_id', v_row.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'already_used', 'status', v_row.status);
  END IF;

  v_has_plus := public.discover_user_has_splove_plus(v_me);
  IF NOT v_has_plus THEN
    SELECT COALESCE(p.second_chance_credits, 0) INTO v_credits
    FROM public.profiles p
    WHERE p.id = v_me
    FOR UPDATE;
    IF NOT FOUND OR v_credits < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_credit');
    END IF;
    UPDATE public.profiles
    SET second_chance_credits = GREATEST(COALESCE(second_chance_credits, 0) - 1, 0)
    WHERE id = v_me
      AND COALESCE(second_chance_credits, 0) >= 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_credit');
    END IF;
  END IF;

  INSERT INTO public.second_chance_requests (sender_id, recipient_id, message, status)
  VALUES (v_me, p_recipient_id, v_trim, 'pending')
  RETURNING id INTO v_req_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_exists');
END;
$$;

REVOKE ALL ON FUNCTION public.create_second_chance_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_second_chance_request(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Accepter / ignorer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_second_chance_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  r public.second_chance_requests%ROWTYPE;
  ua uuid;
  ub uuid;
  mid uuid;
  cid uuid;
  reciprocal boolean;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO r
  FROM public.second_chance_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.recipient_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotence: déjà traité
  IF r.status = 'accepted' AND r.result_conversation_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'accepted',
      'match_id', r.result_match_id,
      'conversation_id', r.result_conversation_id
    );
  END IF;
  IF r.status = 'ignored' THEN
    IF p_accept THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_ignored');
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'ignored');
  END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', r.status);
  END IF;

  IF NOT p_accept THEN
    UPDATE public.second_chance_requests
    SET
      status = 'ignored',
      updated_at = now(),
      responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true, 'status', 'ignored');
  END IF;

  -- Accepter : créer like réciproques + match + conversation (initiator = destinataire = accepteuse)
  ua := LEAST(r.sender_id, r.recipient_id);
  ub := GREATEST(r.sender_id, r.recipient_id);

  IF public.profile_pair_is_blocked(r.sender_id, r.recipient_id) THEN
    UPDATE public.second_chance_requests
    SET
      status = 'ignored',
      updated_at = now(),
      responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  SELECT m.id
  INTO mid
  FROM public.matches m
  WHERE m.user_a = ua AND m.user_b = ub
  LIMIT 1;

  IF mid IS NULL THEN
    INSERT INTO public.likes (liker_id, liked_id)
    VALUES (r.sender_id, r.recipient_id)
    ON CONFLICT (liker_id, liked_id) DO NOTHING;
    INSERT INTO public.likes (liker_id, liked_id)
    VALUES (r.recipient_id, r.sender_id)
    ON CONFLICT (liker_id, liked_id) DO NOTHING;

    SELECT EXISTS (
      SELECT 1 FROM public.likes WHERE liker_id = r.sender_id AND liked_id = r.recipient_id
    ) AND EXISTS (
      SELECT 1 FROM public.likes WHERE liker_id = r.recipient_id AND liked_id = r.sender_id
    )
    INTO reciprocal;
    IF NOT reciprocal THEN
      RETURN jsonb_build_object('ok', false, 'error', 'likes_incomplete');
    END IF;

    INSERT INTO public.matches (id, user_a, user_b, initiator_user)
    VALUES (gen_random_uuid(), ua, ub, r.recipient_id)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    SELECT m2.id
    INTO mid
    FROM public.matches m2
    WHERE m2.user_a = ua AND m2.user_b = ub
    LIMIT 1;
  END IF;

  IF mid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_failed');
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

  UPDATE public.second_chance_requests
  SET
    status = 'accepted',
    updated_at = now(),
    responded_at = now(),
    result_match_id = mid,
    result_conversation_id = cid
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'match_id', mid,
    'conversation_id', cid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_second_chance_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_second_chance_request(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.create_second_chance_request(uuid, text) IS
  'Crée une demande unique (après un pass + crédit ou SPLove+).';
COMMENT ON FUNCTION public.respond_second_chance_request(uuid, boolean) IS
  'Destinataire: accepte (match+conversation, initiator=destinataire) ou ignore définitivement.';
