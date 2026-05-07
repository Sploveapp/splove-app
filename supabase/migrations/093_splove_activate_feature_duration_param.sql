-- Optional p_duration_minutes on splove_activate_feature (must match catalog).
-- Timed features: client passes duration for API clarity; server rejects mismatches.

DROP FUNCTION IF EXISTS public.splove_activate_feature(text, text);
DROP FUNCTION IF EXISTS public.splove_activate_feature(text, text, int);

CREATE FUNCTION public.splove_activate_feature(
  p_feature_type text,
  p_source text,
  p_duration_minutes int DEFAULT NULL
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
  v_expected_minutes int;
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

  v_expected_minutes := CASE p_feature_type
    WHEN 'boost_visibility' THEN 30
    WHEN 'ghost_mode' THEN 24 * 60
    WHEN 'priority_meet' THEN 24 * 60
    ELSE NULL
  END;

  IF v_expected_minutes IS NOT NULL THEN
    IF p_duration_minutes IS NOT NULL AND p_duration_minutes != v_expected_minutes THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bad_duration');
    END IF;
  ELSIF p_duration_minutes IS NOT NULL AND p_duration_minutes != 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_duration');
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
      v_exp := now() + (v_expected_minutes * interval '1 minute');
      INSERT INTO public.feature_activations (user_id, feature_type, started_at, expires_at, metadata)
      VALUES (
        v_uid, 'boost_visibility', now(), v_exp,
        jsonb_build_object('source', p_source)::jsonb
      );

    WHEN 'ghost_mode' THEN
      v_exp := now() + (v_expected_minutes * interval '1 minute');
      INSERT INTO public.feature_activations (user_id, feature_type, started_at, expires_at, metadata)
      VALUES (
        v_uid, 'ghost_mode', now(), v_exp,
        jsonb_build_object('source', p_source)::jsonb
      );

    WHEN 'priority_meet' THEN
      v_exp := now() + (v_expected_minutes * interval '1 minute');
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

COMMENT ON FUNCTION public.splove_activate_feature(text, text, int) IS
  'Timed windows use catalog duration; optional p_duration_minutes must match (or NULL). Ledger + user_credits unchanged.';

REVOKE ALL ON FUNCTION public.splove_activate_feature(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_activate_feature(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.splove_activate_feature(text, text, int) TO service_role;
