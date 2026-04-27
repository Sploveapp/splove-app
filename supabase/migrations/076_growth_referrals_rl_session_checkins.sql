-- Growth: referral codes + rewards, real-life session attendance / completion (trust layer).
-- Complements existing activity_proposals (proposed= pending, accepted) without changing swipe/match.

-- ---------------------------------------------------------------------------
-- 1) Profile: referral + rewards (client cannot forge referred_by; claim via RPC)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rewind_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_plus_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_referral_code
  ON public.profiles (upper(referral_code))
  WHERE referral_code IS NOT NULL AND btrim(referral_code) <> '';

COMMENT ON COLUMN public.profiles.referral_code IS 'Code d''invitation unique (majuscules).';
COMMENT ON COLUMN public.profiles.referred_by_user_id IS 'Parrain (profil) — rempli seulement via claim_referral_invite.';
COMMENT ON COLUMN public.profiles.rewind_credits IS 'Crédits relance/rewind (récompenses growth).';
COMMENT ON COLUMN public.profiles.referral_plus_until IS 'Accès SPLove+ offert par parrainage jusqu''à cette date.';

-- ---------------------------------------------------------------------------
-- 2) Génération de codes + backfill
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_referral_code_raw()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8)) $$;

CREATE OR REPLACE FUNCTION public.ensure_profile_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_try int := 0;
  v_code text;
BEGIN
  IF NEW.referral_code IS NOT NULL AND btrim(NEW.referral_code) <> '' THEN
    NEW.referral_code := upper(btrim(NEW.referral_code));
    RETURN NEW;
  END IF;
  LOOP
    v_code := public.generate_referral_code_raw();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id IS DISTINCT FROM NEW.id AND upper(p.referral_code) = v_code);
    v_try := v_try + 1;
    IF v_try > 40 THEN
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT;
    END IF;
  END LOOP;
  NEW.referral_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_ensure_referral_code
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_profile_referral_code();

-- Backfill one row at a time (génère des codes uniques)
DO $$
DECLARE
  r RECORD;
  v_try int;
  v_code text;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL OR btrim(referral_code) = '' LOOP
    v_try := 0;
    LOOP
      v_code := public.generate_referral_code_raw();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE upper(p.referral_code) = v_code);
      v_try := v_try + 1;
      IF v_try > 50 THEN
        v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        EXIT;
      END IF;
    END LOOP;
    UPDATE public.profiles SET referral_code = v_code WHERE id = r.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Conversions (audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_referral_conversions_referee UNIQUE (referee_id),
  CONSTRAINT referral_conversions_no_self CHECK (referrer_id IS DISTINCT FROM referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer
  ON public.referral_conversions (referrer_id, created_at DESC);

ALTER TABLE public.referral_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_conversions_select_self" ON public.referral_conversions;
CREATE POLICY "referral_conversions_select_self"
  ON public.referral_conversions
  FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Appliquer un code parrain (récompense les deux)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_referral_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_referrer_id uuid;
  v_ref_has uuid;
  v_conv_id uuid;
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  v_code := upper(btrim(COALESCE(p_code, '')));
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

  IF v_referrer_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT p.referred_by_user_id
  INTO v_ref_has
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_ref_has IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_conversions WHERE referee_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  INSERT INTO public.referral_conversions (referrer_id, referee_id, referral_code)
  VALUES (v_referrer_id, v_uid, v_code)
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  UPDATE public.profiles
  SET
    referred_by_user_id = v_referrer_id,
    rewind_credits = COALESCE(rewind_credits, 0) + 1,
    referral_plus_until = GREATEST(
      COALESCE(referral_plus_until, to_timestamp(0) AT TIME ZONE 'UTC'),
      now() + interval '3 days'
    )
  WHERE id = v_uid
    AND referred_by_user_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    DELETE FROM public.referral_conversions WHERE id = v_conv_id;
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  UPDATE public.profiles
  SET
    rewind_credits = COALESCE(rewind_credits, 0) + 1,
    referral_plus_until = GREATEST(
      COALESCE(referral_plus_until, to_timestamp(0) AT TIME ZONE 'UTC'),
      now() + interval '3 days'
    )
  WHERE id = v_referrer_id;

  RETURN jsonb_build_object('ok', true, 'referrer_id', v_referrer_id, 'referee_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_referral_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_referral_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Real-life session check-ins (liées à activity_proposals acceptées)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.real_life_session_checkins (
  activity_proposal_id uuid PRIMARY KEY
    REFERENCES public.activity_proposals (id) ON DELETE CASCADE,
  attendance_user_a_at timestamptz,
  attendance_user_b_at timestamptz,
  session_reported_by_user_a_at timestamptz,
  session_reported_by_user_b_at timestamptz,
  feedback_user_a text,
  feedback_user_b text,
  session_completed_at timestamptz,
  partner_invite_dismissed_a boolean NOT NULL DEFAULT false,
  partner_invite_dismissed_b boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rl_feedback_a_len CHECK (feedback_user_a IS NULL OR char_length(feedback_user_a) <= 200),
  CONSTRAINT rl_feedback_b_len CHECK (feedback_user_b IS NULL OR char_length(feedback_user_b) <= 200)
);

CREATE OR REPLACE FUNCTION public.touch_real_life_session_checkins()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.session_reported_by_user_a_at IS NOT NULL
     AND NEW.session_reported_by_user_b_at IS NOT NULL
     AND NEW.session_completed_at IS NULL THEN
    NEW.session_completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_real_life_session_checkins_touch ON public.real_life_session_checkins;
CREATE TRIGGER trg_real_life_session_checkins_touch
  BEFORE INSERT OR UPDATE ON public.real_life_session_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_real_life_session_checkins();

CREATE INDEX IF NOT EXISTS idx_rl_checkins_completed
  ON public.real_life_session_checkins (session_completed_at)
  WHERE session_completed_at IS NOT NULL;

ALTER TABLE public.real_life_session_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rl_checkins_select_participants" ON public.real_life_session_checkins;
CREATE POLICY "rl_checkins_select_participants"
  ON public.real_life_session_checkins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.activity_proposals ap
      JOIN public.conversations c ON c.id = ap.conversation_id
      JOIN public.matches m ON m.id = c.match_id
      WHERE ap.id = real_life_session_checkins.activity_proposal_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

-- Écriture uniquement via RPC (SECURITY DEFINER) — pas de politique INSERT/UPDATE

-- ---------------------------------------------------------------------------
-- 6) RPC : présence + fin de session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rl_match_users_for_proposal(p_proposal_id uuid)
RETURNS TABLE (user_a uuid, user_b uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_a, m.user_b
  FROM public.activity_proposals ap
  JOIN public.conversations c ON c.id = ap.conversation_id
  JOIN public.matches m ON m.id = c.match_id
  WHERE ap.id = p_proposal_id
    AND ap.status = 'accepted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.rl_match_users_for_proposal(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.rl_session_confirm_attendance(p_proposal_id uuid)
RETURNS public.real_life_session_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  ua uuid;
  ub uuid;
  v_out public.real_life_session_checkins%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT t.user_a, t.user_b INTO ua, ub
  FROM public.rl_match_users_for_proposal(p_proposal_id) AS t (user_a, user_b);
  IF ua IS NULL OR ub IS NULL THEN
    RAISE EXCEPTION 'not_accepted_or_inaccessible';
  END IF;
  IF v_uid NOT IN (ua, ub) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.real_life_session_checkins (activity_proposal_id)
  VALUES (p_proposal_id)
  ON CONFLICT (activity_proposal_id) DO NOTHING;

  IF v_uid = ua THEN
    UPDATE public.real_life_session_checkins r
    SET
      attendance_user_a_at = COALESCE(r.attendance_user_a_at, now()),
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  ELSE
    UPDATE public.real_life_session_checkins r
    SET
      attendance_user_b_at = COALESCE(r.attendance_user_b_at, now()),
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.rl_session_confirm_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rl_session_confirm_attendance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rl_session_report_done(
  p_proposal_id uuid,
  p_feedback text DEFAULT NULL
)
RETURNS public.real_life_session_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  ua uuid;
  ub uuid;
  v_fb text;
  v_out public.real_life_session_checkins%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT t.user_a, t.user_b INTO ua, ub
  FROM public.rl_match_users_for_proposal(p_proposal_id) AS t (user_a, user_b);
  IF ua IS NULL OR ub IS NULL THEN
    RAISE EXCEPTION 'not_accepted_or_inaccessible';
  END IF;
  IF v_uid NOT IN (ua, ub) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_fb := NULLIF(left(btrim(COALESCE(p_feedback, '')), 200), '');

  INSERT INTO public.real_life_session_checkins (activity_proposal_id)
  VALUES (p_proposal_id)
  ON CONFLICT (activity_proposal_id) DO NOTHING;

  IF v_uid = ua THEN
    UPDATE public.real_life_session_checkins r
    SET
      session_reported_by_user_a_at = now(),
      feedback_user_a = COALESCE(v_fb, r.feedback_user_a),
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  ELSE
    UPDATE public.real_life_session_checkins r
    SET
      session_reported_by_user_b_at = now(),
      feedback_user_b = COALESCE(v_fb, r.feedback_user_b),
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.rl_session_report_done(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rl_session_report_done(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rl_invite_nudge_dismiss(p_proposal_id uuid)
RETURNS public.real_life_session_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  ua uuid;
  ub uuid;
  v_out public.real_life_session_checkins%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT t.user_a, t.user_b INTO ua, ub
  FROM public.rl_match_users_for_proposal(p_proposal_id) AS t (user_a, user_b);
  IF ua IS NULL OR ub IS NULL THEN
    RAISE EXCEPTION 'not_accepted_or_inaccessible';
  END IF;
  IF v_uid NOT IN (ua, ub) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.real_life_session_checkins (activity_proposal_id)
  VALUES (p_proposal_id)
  ON CONFLICT (activity_proposal_id) DO NOTHING;

  IF v_uid = ua THEN
    UPDATE public.real_life_session_checkins r
    SET
      partner_invite_dismissed_a = true,
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  ELSE
    UPDATE public.real_life_session_checkins r
    SET
      partner_invite_dismissed_b = true,
      updated_at = now()
    WHERE r.activity_proposal_id = p_proposal_id
    RETURNING * INTO v_out;
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.rl_invite_nudge_dismiss(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rl_invite_nudge_dismiss(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Vérification d'accessibilité des proposals acceptées
-- ---------------------------------------------------------------------------
-- Grant usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.real_life_session_checkins TO authenticated;
