-- « Retour profil » (rewind) — feature `undo_swipe_return` (catalogue) + crédits achat unitaire.
-- N’alère pas record_discover_swipe ni la pile Discover ; seulement les RPC rewind.
-- - user_has_feature('undo_swipe_return') : illimité côté limites (équiv. SPLove+ sur ce flux + entitlements).
-- - crédit profil : un bypass sans comptabiliser le plafond gratuit (pas d’insert discover_rewind_ledger).
-- - sinon : mêmes règles freemium qu’avant (fenêtre 5 min, max 2 / 5 min).
-- Nécessite : public.user_has_feature, public.features, public.profiles, discover_* existants.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS undo_swipe_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.undo_swipe_credits IS
  'Crédits « retour profil » (achat unitaire) — consommés côté rewind_last_discover_swipe.';

INSERT INTO public.features (key, label, description, category, is_active)
VALUES (
  'undo_swipe_return',
  'Retour profil',
  'Revenir sur le dernier profil ignoré ou swipé',
  'engagement',
  true
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- rewind_last_discover_swipe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rewind_last_discover_swipe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_splove_crossing boolean;
  v_has_undo boolean;
  v_credits int;
  v_rewind_count_5m int;
  v_row_upd int;
  v_use_credit boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  v_splove_crossing := public.discover_user_has_splove_plus(v_uid);
  v_has_undo := public.user_has_feature('undo_swipe_return');

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

  SELECT COALESCE(p.undo_swipe_credits, 0) INTO v_credits
  FROM public.profiles p
  WHERE p.id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  -- Pas illimité via SPLove+ / entitlement : tenter un crédit, sinon plafond gratuit
  IF NOT v_has_undo THEN
    IF v_credits < 1 THEN
      IF e.created_at < now() - interval '5 minutes' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'time_window');
      END IF;
      SELECT count(*)::int INTO v_rewind_count_5m
      FROM public.discover_rewind_ledger
      WHERE user_id = v_uid
        AND created_at > now() - interval '5 minutes';
      IF v_rewind_count_5m >= 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rewind_rate');
      END IF;
    ELSE
      v_use_credit := true;
    END IF;
  END IF;

  IF v_use_credit THEN
    UPDATE public.profiles
    SET undo_swipe_credits = GREATEST(COALESCE(undo_swipe_credits, 0) - 1, 0)
    WHERE id = v_uid
      AND COALESCE(undo_swipe_credits, 0) >= 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_undo_credits');
    END IF;
  END IF;

  IF e.action = 'like' THEN
    DELETE FROM public.likes
    WHERE liker_id = v_uid AND liked_id = e.target_id;
  END IF;

  DELETE FROM public.discover_swipe_events WHERE id = e.id;

  -- Ligne comptable « gratuit » seulement si pas consommation de crédit (les crédits n’alourdissent pas le 2/5 min)
  IF NOT v_use_credit THEN
    INSERT INTO public.discover_rewind_ledger (user_id) VALUES (v_uid);
  END IF;

  UPDATE public.discover_profile_crossings c
  SET
    state = 'seen',
    last_interaction_at = now(),
    expires_at = CASE
      WHEN v_splove_crossing THEN NULL
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
      CASE WHEN v_splove_crossing THEN NULL ELSE now() + interval '24 hours' END
    )
    ON CONFLICT (viewer_id, target_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'target_id', e.target_id, 'action', e.action, 'used_credit', v_use_credit);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_discover_rewind_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_discover_rewind_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_splove boolean;
  v_has_undo boolean;
  v_credits int;
  v_rewind_count_5m int;
  v_can boolean;
  v_reason text := null;
  v_free_limit int := 2;
  v_suggest_paywall boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'auth',
      'has_premium', false,
      'has_undo_feature', false,
      'undo_credits', 0,
      'suggest_paywall', false,
      'rewind_count', 0,
      'rewind_limit_free', v_free_limit,
      'last_swipe_at', null
    );
  END IF;

  v_splove := public.discover_user_has_splove_plus(v_uid);
  v_has_undo := public.user_has_feature('undo_swipe_return');

  SELECT COALESCE(p.undo_swipe_credits, 0) INTO v_credits
  FROM public.profiles p
  WHERE p.id = v_uid;

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
      'has_premium', v_splove,
      'has_undo_feature', v_has_undo,
      'undo_credits', COALESCE(v_credits, 0),
      'suggest_paywall', false,
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
      'has_premium', v_splove,
      'has_undo_feature', v_has_undo,
      'undo_credits', COALESCE(v_credits, 0),
      'suggest_paywall', false,
      'last_is_match', true,
      'rewind_count', v_rewind_count_5m,
      'rewind_limit_free', v_free_limit,
      'last_swipe_at', e.created_at
    );
  END IF;

  v_can := true;
  IF v_has_undo THEN
    v_can := true;
  ELSIF COALESCE(v_credits, 0) >= 1 THEN
    v_can := true;
  ELSE
    IF e.created_at < now() - interval '5 minutes' THEN
      v_can := false;
      v_reason := 'time_window';
    END IF;
    IF v_can AND v_rewind_count_5m >= 2 THEN
      v_can := false;
      v_reason := 'rewind_rate';
    END IF;
  END IF;

  v_suggest_paywall := NOT v_can AND NOT v_has_undo AND COALESCE(v_credits, 0) < 1;

  RETURN jsonb_build_object(
    'can_rewind', v_can,
    'reason', v_reason,
    'has_premium', v_splove,
    'has_undo_feature', v_has_undo,
    'undo_credits', COALESCE(v_credits, 0),
    'suggest_paywall', v_suggest_paywall,
    'last_action', e.action,
    'last_is_match', e.is_match,
    'rewind_count', v_rewind_count_5m,
    'rewind_limit_free', v_free_limit,
    'last_swipe_at', e.created_at
  );
END;
$$;

COMMENT ON FUNCTION public.rewind_last_discover_swipe() IS
  'Retour : user_has_feature(undo) illimité ; sinon crédit (sans ledger gratuit) ; sinon plafond gratuit.';
