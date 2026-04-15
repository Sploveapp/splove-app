-- =============================================
-- SPLove — Modération photos (slots, résultats, signalements, file admin)
-- =============================================

-- --- 1) Colonnes profiles (photo1 = portrait, photo2 = corps / en pied) ---
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo1_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS photo2_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS photo_moderation_overall TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_under_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_strikes_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.photo1_status IS 'pending | approved | pending_review | rejected — slot 1 (portrait / main)';
COMMENT ON COLUMN public.profiles.photo2_status IS 'pending | approved | pending_review | rejected — slot 2 (corps)';
COMMENT ON COLUMN public.profiles.photo_moderation_overall IS 'Synthèse modération automatique + revue';
COMMENT ON COLUMN public.profiles.is_under_review IS 'true si au moins une photo en pending_review';
COMMENT ON COLUMN public.profiles.moderation_strikes_count IS 'Compteur de refus modération (signal produit)';

-- Étendre les contraintes existantes (migration 043) pour pending_review
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_portrait_photo_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_portrait_photo_status_check
  CHECK (portrait_photo_status IN ('pending', 'approved', 'rejected', 'pending_review'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_body_photo_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_body_photo_status_check
  CHECK (body_photo_status IN ('pending', 'approved', 'rejected', 'pending_review'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_photo1_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo1_status_check
  CHECK (photo1_status IN ('pending', 'approved', 'rejected', 'pending_review'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_photo2_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo2_status_check
  CHECK (photo2_status IN ('pending', 'approved', 'rejected', 'pending_review'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_photo_moderation_overall_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo_moderation_overall_check
  CHECK (photo_moderation_overall IN ('pending', 'approved', 'rejected', 'pending_review'));

-- Aligner les slots sur les colonnes historiques portrait / corps
UPDATE public.profiles
SET
  photo1_status = portrait_photo_status,
  photo2_status = body_photo_status
WHERE photo1_status IS DISTINCT FROM portrait_photo_status
   OR photo2_status IS DISTINCT FROM body_photo_status;

-- Ancien trigger : dérivait photo_verification depuis portrait/body — remplacé par logique slots
DROP TRIGGER IF EXISTS trg_profiles_sync_photo_verification ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_photo_verification_status_from_parts();

CREATE OR REPLACE FUNCTION public.sync_profiles_from_photo_slots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.portrait_photo_status := NEW.photo1_status;
  NEW.body_photo_status := NEW.photo2_status;

  IF NEW.photo1_status = 'approved' AND NEW.photo2_status = 'approved' THEN
    NEW.photo_verification_status := 'approved';
  ELSIF NEW.photo1_status = 'rejected' OR NEW.photo2_status = 'rejected' THEN
    NEW.photo_verification_status := 'rejected';
  ELSE
    NEW.photo_verification_status := 'pending';
  END IF;

  IF NEW.photo1_status = 'rejected' OR NEW.photo2_status = 'rejected' THEN
    NEW.photo_moderation_overall := 'rejected';
  ELSIF NEW.photo1_status = 'pending_review' OR NEW.photo2_status = 'pending_review' THEN
    NEW.photo_moderation_overall := 'pending_review';
  ELSIF NEW.photo1_status = 'approved' AND NEW.photo2_status = 'approved' THEN
    NEW.photo_moderation_overall := 'approved';
  ELSE
    NEW.photo_moderation_overall := 'pending';
  END IF;

  NEW.is_under_review :=
    (NEW.photo1_status = 'pending_review' OR NEW.photo2_status = 'pending_review');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_from_photo_slots ON public.profiles;
CREATE TRIGGER trg_profiles_sync_from_photo_slots
  BEFORE INSERT OR UPDATE OF photo1_status, photo2_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profiles_from_photo_slots();

COMMENT ON FUNCTION public.sync_profiles_from_photo_slots() IS
  'Miroir photo1→portrait / photo2→body, photo_verification_status, photo_moderation_overall, is_under_review.';

-- Recalcul initial pour photo_moderation_overall / is_under_review
UPDATE public.profiles
SET photo1_status = photo1_status;

-- --- 2) Résultats modération ---
CREATE TABLE IF NOT EXISTS public.photo_moderation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_slot INTEGER NOT NULL CHECK (photo_slot IN (1, 2)),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending_review', 'rejected')),
  provider TEXT,
  provider_labels JSONB,
  risk_score NUMERIC,
  decision_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_moderation_results_user_slot
  ON public.photo_moderation_results (user_id, photo_slot, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photo_moderation_results_status_created
  ON public.photo_moderation_results (status, created_at DESC)
  WHERE status = 'pending_review';

COMMENT ON TABLE public.photo_moderation_results IS 'Historique modération auto (Edge) + revue humaine';

-- --- 3) Signalements photo utilisateurs ---
CREATE TABLE IF NOT EXISTS public.photo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_slot INTEGER NOT NULL CHECK (photo_slot IN (1, 2)),
  reason TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT photo_reports_no_self CHECK (reporter_user_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_reports_reported ON public.photo_reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_reports_status ON public.photo_reports (status, created_at DESC);

COMMENT ON TABLE public.photo_reports IS 'Signalements ciblés sur une photo d’un profil';

-- --- 4) Staff modération (liste vide par défaut ; INSERT manuel côté prod) ---
CREATE TABLE IF NOT EXISTS public.moderation_staff (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.moderation_staff IS 'Utilisateurs autorisés à lire/modérer la file photos (RLS)';

-- --- RLS photo_moderation_results ---
ALTER TABLE public.photo_moderation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_moderation_results_staff_select ON public.photo_moderation_results;
CREATE POLICY photo_moderation_results_staff_select
  ON public.photo_moderation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  );

DROP POLICY IF EXISTS photo_moderation_results_staff_update ON public.photo_moderation_results;
CREATE POLICY photo_moderation_results_staff_update
  ON public.photo_moderation_results FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  );

-- --- RLS photo_reports : insert soi-même uniquement, pas de lecture grand public ---
ALTER TABLE public.photo_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_reports_insert_self ON public.photo_reports;
CREATE POLICY photo_reports_insert_self
  ON public.photo_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_user_id = auth.uid());

DROP POLICY IF EXISTS photo_reports_staff_select ON public.photo_reports;
CREATE POLICY photo_reports_staff_select
  ON public.photo_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  );

DROP POLICY IF EXISTS photo_reports_staff_update ON public.photo_reports;
CREATE POLICY photo_reports_staff_update
  ON public.photo_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid())
  );

-- --- RLS moderation_staff : aucun accès client (gestion SQL / dashboard) ---
ALTER TABLE public.moderation_staff ENABLE ROW LEVEL SECURITY;

-- --- RPC : décision humaine sur une ligne pending_review ---
CREATE OR REPLACE FUNCTION public.moderation_resolve_photo_result(
  p_result_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.photo_moderation_results%ROWTYPE;
  v_status text;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.moderation_staff ms WHERE ms.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.photo_moderation_results WHERE id = p_result_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  v_status := p_decision;

  UPDATE public.photo_moderation_results
  SET
    status = v_status,
    reviewed_by = auth.uid(),
    reviewed_at = NOW()
  WHERE id = p_result_id;

  IF r.photo_slot = 1 THEN
    UPDATE public.profiles
    SET
      photo1_status = v_status,
      portrait_rejection_code = CASE WHEN v_status = 'rejected' THEN 'moderator_review' ELSE NULL END
    WHERE id = r.user_id;
  ELSE
    UPDATE public.profiles
    SET
      photo2_status = v_status,
      body_rejection_code = CASE WHEN v_status = 'rejected' THEN 'moderator_review' ELSE NULL END
    WHERE id = r.user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', r.user_id, 'photo_slot', r.photo_slot, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_resolve_photo_result(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderation_resolve_photo_result(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.moderation_resolve_photo_result(uuid, text) IS
  'Staff : tranche une entrée photo_moderation_results + met à jour le slot profiles correspondant.';

-- --- Discover : inchangé si photo_verification_status = approved (dérivé des slots) ---
CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND COALESCE(p.photo_verification_status, 'pending') = 'approved';

COMMENT ON VIEW public.feed_profiles IS
  'Profils likables : compte auth actif et validation photos (slots) approuvée';

GRANT SELECT ON public.feed_profiles TO authenticated;

GRANT SELECT, UPDATE ON public.photo_moderation_results TO authenticated;
GRANT INSERT ON public.photo_reports TO authenticated;
