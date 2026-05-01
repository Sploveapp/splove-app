-- Bêta SPLove : accorder « undo_swipe_return » depuis l’écran SPLove+
-- (droits alignés avec public.user_has_feature / rewind_last_discover_swipe).

CREATE OR REPLACE FUNCTION public.activate_beta_undo_swipe_return()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  INSERT INTO public.user_entitlements (user_id, feature_key, source, expires_at, metadata)
  VALUES (v_uid, 'undo_swipe_return', 'beta', NULL, '{}'::jsonb)
  ON CONFLICT (user_id, feature_key) DO UPDATE SET
    source = EXCLUDED.source,
    expires_at = COALESCE(public.user_entitlements.expires_at, EXCLUDED.expires_at),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_beta_undo_swipe_return() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_beta_undo_swipe_return() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_beta_undo_swipe_return() TO service_role;
