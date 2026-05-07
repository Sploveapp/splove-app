-- SPLove+ consumable credits, purchases (stub), ledger, and timed feature_activations.
-- Undo / second chance bridge to profiles.*_credits for existing RPCs (rewind, second chance).

-- ---------------------------------------------------------------------------
-- purchases (in-app; mock / placeholder until store SDK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  platform text NOT NULL DEFAULT 'mock' CHECK (platform IN ('ios', 'android', 'web', 'mock')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  receipt_token text,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_created ON public.purchases (user_id, created_at DESC);

COMMENT ON TABLE public.purchases IS
  'In-app purchase rows; completes via Edge / verify later ; mock flow allowed for beta.';

-- ---------------------------------------------------------------------------
-- user_credits — balance per credit type (packs before “claim” / timed activations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  credit_type text NOT NULL CHECK (credit_type IN (
    'boost_visibility',
    'ghost_mode',
    'undo_swipe',
    'second_chance',
    'priority_meet'
  )),
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, credit_type)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user ON public.user_credits (user_id);

COMMENT ON TABLE public.user_credits IS
  'Splove+ consumable credit balances keyed by catalog credit_type.';

-- ---------------------------------------------------------------------------
-- credit_ledger — append-only accounting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  credit_type text NOT NULL,
  quantity_delta int NOT NULL,
  balance_after int NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (reason IN (
    'grant',
    'consume_activate',
    'beta_activation',
    'mock_purchase',
    'purchase_grant',
    'adjustment'
  )),
  purchase_id uuid REFERENCES public.purchases (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON public.credit_ledger (user_id, created_at DESC);

COMMENT ON TABLE public.credit_ledger IS
  'Credits movements; beta_activation keeps balance_after unchanged when quantity_delta = 0.';

-- ---------------------------------------------------------------------------
-- feature_activations — authoritative active window for timed boosts (expires_at > now())
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  feature_type text NOT NULL CHECK (feature_type IN (
    'boost_visibility',
    'ghost_mode',
    'priority_meet'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_activations_user_type_expires
  ON public.feature_activations (user_id, feature_type, expires_at DESC);

COMMENT ON TABLE public.feature_activations IS
  'Timed SPLove+ feature windows; UI “active” only when expires_at > now().';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select_own" ON public.purchases;
CREATE POLICY "purchases_select_own"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_credits_select_own" ON public.user_credits;
CREATE POLICY "user_credits_select_own"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "credit_ledger_select_own" ON public.credit_ledger;
CREATE POLICY "credit_ledger_select_own"
  ON public.credit_ledger FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "feature_activations_select_own" ON public.feature_activations;
CREATE POLICY "feature_activations_select_own"
  ON public.feature_activations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.purchases TO authenticated;
GRANT SELECT ON public.user_credits TO authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT SELECT ON public.feature_activations TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal: append ledger + bump balance (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._splove_credit_apply_delta(
  p_uid uuid,
  p_credit_type text,
  p_delta int,
  p_reason text,
  p_purchase_id uuid,
  p_meta jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur int;
  v_new int;
BEGIN
  IF p_uid IS NULL THEN
    RETURN 0;
  END IF;
  IF p_delta = 0 THEN
    SELECT COALESCE(quantity, 0) INTO v_cur FROM public.user_credits
    WHERE user_id = p_uid AND credit_type = p_credit_type;
    RETURN COALESCE(v_cur, 0);
  END IF;

  INSERT INTO public.user_credits (user_id, credit_type, quantity)
  VALUES (p_uid, p_credit_type, 0)
  ON CONFLICT (user_id, credit_type) DO NOTHING;

  SELECT quantity INTO v_cur
  FROM public.user_credits
  WHERE user_id = p_uid AND credit_type = p_credit_type
  FOR UPDATE;

  v_cur := COALESCE(v_cur, 0);
  v_new := v_cur + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'splove_insufficient_credits'
      USING ERRCODE = 'S1001';
  END IF;

  UPDATE public.user_credits
  SET quantity = v_new, updated_at = now()
  WHERE user_id = p_uid AND credit_type = p_credit_type;

  INSERT INTO public.credit_ledger (
    user_id, credit_type, quantity_delta, balance_after, reason, purchase_id, metadata
  ) VALUES (
    p_uid,
    p_credit_type,
    p_delta,
    v_new,
    p_reason,
    p_purchase_id,
    COALESCE(p_meta, '{}'::jsonb)
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public._splove_credit_apply_delta(uuid, text, int, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._splove_credit_apply_delta(uuid, text, int, text, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- splove_grant_credit — grant packs (purchase / admin / stub)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_grant_credit(
  p_credit_type text,
  p_quantity int,
  p_reason text DEFAULT 'grant',
  p_purchase_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_quantity');
  END IF;

  SELECT public._splove_credit_apply_delta(
    v_uid, p_credit_type, p_quantity, p_reason, p_purchase_id, p_metadata
  ) INTO v_bal;

  RETURN jsonb_build_object('ok', true, 'balance_after', v_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.splove_grant_credit(text, int, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_grant_credit(text, int, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.splove_grant_credit(text, int, text, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- splove_consume_credit — consume without activating (reserved for tooling)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_consume_credit(p_credit_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  BEGIN
    SELECT public._splove_credit_apply_delta(
      v_uid, p_credit_type, -1, 'consume_activate', NULL,
      '{}'::jsonb
    ) INTO v_bal;
  EXCEPTION
    WHEN SQLSTATE 'S1001' THEN
      RETURN jsonb_build_object('ok', false, 'need_purchase', true);
  END;

  RETURN jsonb_build_object('ok', true, 'balance_after', v_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.splove_consume_credit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_consume_credit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.splove_consume_credit(text) TO service_role;

-- ---------------------------------------------------------------------------
-- splove_activate_feature — credit or beta ; ledger rows ; timed rows in feature_activations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_activate_feature(
  p_feature_type text,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_credit text;
  v_exp timestamptz;
  v_bal int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('credit', 'beta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_source');
  END IF;

  v_credit := CASE p_feature_type
    WHEN 'boost_visibility' THEN 'boost_visibility'
    WHEN 'ghost_mode' THEN 'ghost_mode'
    WHEN 'undo_swipe' THEN 'undo_swipe'
    WHEN 'second_chance' THEN 'second_chance'
    WHEN 'priority_meet' THEN 'priority_meet'
    ELSE NULL
  END;

  IF v_credit IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_feature');
  END IF;

  IF p_source = 'credit' THEN
    BEGIN
      SELECT public._splove_credit_apply_delta(
        v_uid, v_credit, -1, 'consume_activate', NULL,
        jsonb_build_object('feature_type', p_feature_type)
      ) INTO v_bal;
    EXCEPTION
      WHEN SQLSTATE 'S1001' THEN
        RETURN jsonb_build_object('ok', false, 'need_purchase', true);
    END;
  ELSE
    SELECT COALESCE(quantity, 0) INTO v_bal
    FROM public.user_credits
    WHERE user_id = v_uid AND credit_type = v_credit;

    INSERT INTO public.credit_ledger (
      user_id, credit_type, quantity_delta, balance_after, reason, purchase_id, metadata
    ) VALUES (
      v_uid,
      v_credit,
      0,
      COALESCE(v_bal, 0),
      'beta_activation',
      NULL,
      jsonb_build_object('feature_type', p_feature_type)
    );
  END IF;

  CASE p_feature_type
    WHEN 'boost_visibility' THEN
      v_exp := now() + interval '30 minutes';
      INSERT INTO public.feature_activations (user_id, feature_type, started_at, expires_at, metadata)
      VALUES (
        v_uid, 'boost_visibility', now(), v_exp,
        jsonb_build_object('source', p_source)::jsonb
      );

    WHEN 'ghost_mode' THEN
      v_exp := now() + interval '24 hours';
      INSERT INTO public.feature_activations (user_id, feature_type, started_at, expires_at, metadata)
      VALUES (
        v_uid, 'ghost_mode', now(), v_exp,
        jsonb_build_object('source', p_source)::jsonb
      );

    WHEN 'priority_meet' THEN
      v_exp := now() + interval '24 hours';
      INSERT INTO public.feature_activations (user_id, feature_type, started_at, expires_at, metadata)
      VALUES (
        v_uid, 'priority_meet', now(), v_exp,
        jsonb_build_object('source', p_source)::jsonb
      );

    WHEN 'undo_swipe' THEN
      UPDATE public.profiles
      SET undo_swipe_credits = COALESCE(undo_swipe_credits, 0) + 1
      WHERE id = v_uid;

    WHEN 'second_chance' THEN
      UPDATE public.profiles
      SET second_chance_credits = COALESCE(second_chance_credits, 0) + 1
      WHERE id = v_uid;

    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'unsupported');
  END CASE;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_exp);
END;
$$;

REVOKE ALL ON FUNCTION public.splove_activate_feature(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_activate_feature(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.splove_activate_feature(text, text) TO service_role;

COMMENT ON FUNCTION public.splove_activate_feature(text, text) IS
  'p_source=credit consumes user_credits; beta writes credit_ledger row + effect. Timed rows in feature_activations.';

-- ---------------------------------------------------------------------------
-- splove_complete_mock_purchase — placeholder store flow (+1 matching credit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_complete_mock_purchase(p_product_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_credit text;
  v_purchase_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  v_credit := CASE trim(p_product_id)
    WHEN 'splove_boost_30m' THEN 'boost_visibility'
    WHEN 'splove_ghost_24h' THEN 'ghost_mode'
    WHEN 'splove_undo_1' THEN 'undo_swipe'
    WHEN 'splove_second_chance_1' THEN 'second_chance'
    WHEN 'splove_priority_meet_24h' THEN 'priority_meet'
    ELSE NULL
  END;

  IF v_credit IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_product');
  END IF;

  INSERT INTO public.purchases (user_id, product_id, platform, status, metadata)
  VALUES (
    v_uid,
    trim(p_product_id),
    'mock',
    'completed',
    jsonb_build_object('stub', true)
  )
  RETURNING id INTO v_purchase_id;

  PERFORM public._splove_credit_apply_delta(
    v_uid,
    v_credit,
    1,
    'mock_purchase',
    v_purchase_id,
    jsonb_build_object('product_id', p_product_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'credit_type', v_credit,
    'granted_quantity', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.splove_complete_mock_purchase(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_complete_mock_purchase(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.splove_complete_mock_purchase(text) TO service_role;
