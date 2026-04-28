-- Achat unitaire d'un crédit rewind Discover (1,99 EUR).
-- Utilisé par le paywall in-app lorsque l'utilisateur gratuit n'a plus de rewind dispo.

CREATE OR REPLACE FUNCTION public.purchase_discover_rewind_credit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_credits int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  -- Ligne d'achat (paiement réel branché plus tard; beta/mock côté app).
  INSERT INTO public.feature_purchases (user_id, feature_key, price_paid)
  VALUES (v_uid, 'undo_swipe_return', 1.99);

  UPDATE public.profiles
  SET undo_swipe_credits = COALESCE(undo_swipe_credits, 0) + 1
  WHERE id = v_uid
  RETURNING undo_swipe_credits INTO v_credits;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  RETURN jsonb_build_object('ok', true, 'credits', COALESCE(v_credits, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_discover_rewind_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_discover_rewind_credit() TO authenticated;
