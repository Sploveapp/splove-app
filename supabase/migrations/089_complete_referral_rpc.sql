-- Referral SPLove — fin d’onboarding : complete_referral(referee_id, code)
-- Récompense le parrain (pas l’auto-parrainage). Idempotent par referee_id.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS boost_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS beta_splove_plus_unlocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.boost_credits IS
  'Crédits pour activer la visibilité boost (référence, promos futures).';

COMMENT ON COLUMN public.profiles.beta_splove_plus_unlocked IS
  'Accès SPLove+ (bêta) accordé définitivement via parrainage validé — voir discover_user_has_splove_plus.';

-- SPLove+ : abonnement, fenêtre referral_plus_until OU déblocage parrain définitif
CREATE OR REPLACE FUNCTION public.discover_user_has_splove_plus(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub boolean;
  v_ref timestamptz;
  v_beta boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = p_uid
      AND s.status = 'active'
      AND (s.ends_at IS NULL OR s.ends_at > now())
  ) INTO v_sub;

  IF v_sub THEN
    RETURN true;
  END IF;

  SELECT p.referral_plus_until, COALESCE(p.beta_splove_plus_unlocked, false)
  INTO v_ref, v_beta
  FROM public.profiles p
  WHERE p.id = p_uid;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_beta IS TRUE THEN
    RETURN true;
  END IF;

  IF v_ref IS NOT NULL AND v_ref > now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.discover_user_has_splove_plus(uuid) IS
  'Premium Discover : souscription active, referral_plus_until, ou beta_splove_plus_unlocked (parrainage).';

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_referral(p_user_id uuid, p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code text;
  v_referrer_id uuid;
  v_conv_id uuid;
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF v_actor <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_code := upper(btrim(COALESCE(p_referral_code, '')));
  IF v_code = '' OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT p.id
  INTO v_referrer_id
  FROM public.profiles p
  WHERE upper(p.referral_code) = v_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_referrer_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referral_conversions (referrer_id, referee_id, referral_code)
  VALUES (v_referrer_id, p_user_id, v_code)
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  UPDATE public.profiles
  SET
    referred_by_user_id = v_referrer_id,
    rewind_credits = COALESCE(rewind_credits, 0) + 1,
    referral_plus_until = GREATEST(
      COALESCE(referral_plus_until, to_timestamp(0) AT TIME ZONE 'UTC'),
      now() + interval '3 days'
    )
  WHERE id = p_user_id
    AND referred_by_user_id IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    DELETE FROM public.referral_conversions WHERE id = v_conv_id;
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  UPDATE public.profiles
  SET
    boost_credits = COALESCE(boost_credits, 0) + 3,
    undo_swipe_credits = COALESCE(undo_swipe_credits, 0) + 3,
    second_chance_credits = COALESCE(second_chance_credits, 0) + 2,
    beta_splove_plus_unlocked = true
  WHERE id = v_referrer_id;

  RETURN jsonb_build_object(
    'ok',
    true,
    'referrer_id',
    v_referrer_id,
    'referee_id',
    p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_referral(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_referral(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.complete_referral(uuid, text) IS
  'Après onboarding : lie le filleul, récompense le parrain (crédits + beta SPLove+). Pas d’auto-parrainage ; idempotent.';
