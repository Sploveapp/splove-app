-- Freemium Discover rewind: free = max 2 rewinds / 5 min + last swipe < 5 min; Splove+ = sans limite.
-- N’alère pas le schéma des tables; seulement la logique des RPC.

CREATE OR REPLACE FUNCTION public.rewind_last_discover_swipe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_premium boolean;
  v_rewind_count_5m int;
  v_row_upd int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  SELECT * INTO e
  FROM public.discover_swipe_events
  WHERE viewer_id = v_uid
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_swipe');
  END IF;

  IF e.is_match THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_not_rewindable');
  END IF;

  v_premium := public.discover_user_has_splove_plus(v_uid);

  IF NOT v_premium THEN
    IF e.created_at < now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'time_window');
    END IF;

    SELECT count(*)::int INTO v_rewind_count_5m
    FROM public.discover_rewind_ledger
    WHERE user_id = v_uid
      AND created_at > now() - interval '5 minutes';

    -- Gratuit : max 2 annulations / fenêtre glissante 5 min
    IF v_rewind_count_5m >= 2 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rewind_rate');
    END IF;
  END IF;

  IF e.action = 'like' THEN
    DELETE FROM public.likes
    WHERE liker_id = v_uid AND liked_id = e.target_id;
  END IF;

  DELETE FROM public.discover_swipe_events WHERE id = e.id;

  INSERT INTO public.discover_rewind_ledger (user_id) VALUES (v_uid);

  UPDATE public.discover_profile_crossings c
  SET
    state = 'seen',
    last_interaction_at = now(),
    expires_at = CASE
      WHEN v_premium THEN NULL
      ELSE now() + interval '24 hours'
    END
  WHERE c.viewer_id = v_uid AND c.target_id = e.target_id;
  GET DIAGNOSTICS v_row_upd = ROW_COUNT;

  IF v_row_upd = 0 THEN
    INSERT INTO public.discover_profile_crossings (viewer_id, target_id, state, last_interaction_at, expires_at)
    VALUES (
      v_uid,
      e.target_id,
      'seen',
      now(),
      CASE WHEN v_premium THEN NULL ELSE now() + interval '24 hours' END
    )
    ON CONFLICT (viewer_id, target_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'target_id', e.target_id, 'action', e.action);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discover_rewind_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_premium boolean;
  v_rewind_count_5m int;
  v_can boolean;
  v_reason text := null;
  v_free_limit int := 2;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'auth',
      'has_premium', false,
      'rewind_count', 0,
      'rewind_limit_free', v_free_limit,
      'last_swipe_at', null
    );
  END IF;

  v_premium := public.discover_user_has_splove_plus(v_uid);

  SELECT * INTO e
  FROM public.discover_swipe_events
  WHERE viewer_id = v_uid
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT count(*)::int INTO v_rewind_count_5m
    FROM public.discover_rewind_ledger
    WHERE user_id = v_uid
      AND created_at > now() - interval '5 minutes';
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'no_swipe',
      'has_premium', v_premium,
      'rewind_count', COALESCE(v_rewind_count_5m, 0),
      'rewind_limit_free', v_free_limit,
      'last_swipe_at', null
    );
  END IF;

  SELECT count(*)::int INTO v_rewind_count_5m
  FROM public.discover_rewind_ledger
  WHERE user_id = v_uid
    AND created_at > now() - interval '5 minutes';

  IF e.is_match THEN
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'match',
      'has_premium', v_premium,
      'last_is_match', true,
      'rewind_count', v_rewind_count_5m,
      'rewind_limit_free', v_free_limit,
      'last_swipe_at', e.created_at
    );
  END IF;

  v_can := true;
  IF NOT v_premium THEN
    IF e.created_at < now() - interval '5 minutes' THEN
      v_can := false;
      v_reason := 'time_window';
    END IF;
    IF v_can AND v_rewind_count_5m >= 2 THEN
      v_can := false;
      v_reason := 'rewind_rate';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'can_rewind', v_can,
    'reason', v_reason,
    'has_premium', v_premium,
    'last_action', e.action,
    'last_is_match', e.is_match,
    'rewind_count', v_rewind_count_5m,
    'rewind_limit_free', v_free_limit,
    'last_swipe_at', e.created_at
  );
END;
$$;
