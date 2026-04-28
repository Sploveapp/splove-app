-- Seconde chance : privilégier user_has_feature('second_chance_return') ;
-- conserve le fallback second_chance_credits si pas d’entitlement (legacy / campagnes).

CREATE OR REPLACE FUNCTION public.create_second_chance_request(p_recipient_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_trim text;
  v_feature_ok boolean;
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

  v_feature_ok := public.user_has_feature('second_chance_return');
  IF NOT v_feature_ok THEN
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

COMMENT ON FUNCTION public.create_second_chance_request(uuid, text) IS
  'Seconde chance : user_has_feature(second_chance_return) ou crédit profil.';
