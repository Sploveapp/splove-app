-- =============================================
-- SPLove — Validation photos (portrait + silhouette + statut global)
-- =============================================
-- Statuts : pending | approved | rejected (photo_verification_status aligné sur les deux sous-statuts via trigger)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portrait_photo_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS body_photo_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS portrait_rejection_code TEXT,
  ADD COLUMN IF NOT EXISTS body_rejection_code TEXT;

COMMENT ON COLUMN public.profiles.portrait_photo_status IS 'pending | approved | rejected — photo visage';
COMMENT ON COLUMN public.profiles.body_photo_status IS 'pending | approved | rejected — photo silhouette / corps';
COMMENT ON COLUMN public.profiles.portrait_rejection_code IS 'Code métier optionnel : face_not_detected, non_compliant, not_personal, …';
COMMENT ON COLUMN public.profiles.body_rejection_code IS 'Code métier optionnel : silhouette_not_visible, non_compliant, not_personal, …';

-- Ancienne valeur Veriff « review » → pending ; normalisation casse pour contraintes CHECK
UPDATE public.profiles
SET photo_verification_status = 'pending'
WHERE photo_verification_status IS NOT NULL
  AND lower(trim(photo_verification_status)) = 'review';

UPDATE public.profiles
SET photo_verification_status = lower(trim(photo_verification_status))
WHERE photo_verification_status IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_portrait_photo_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_portrait_photo_status_check
  CHECK (portrait_photo_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_body_photo_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_body_photo_status_check
  CHECK (body_photo_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_photo_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo_verification_status_check
  CHECK (photo_verification_status IN ('pending', 'approved', 'rejected'));

-- Profils déjà complétés avec les deux photos : considérés comme validés (évite de bloquer l’existant).
UPDATE public.profiles
SET
  portrait_photo_status = 'approved',
  body_photo_status = 'approved',
  photo_verification_status = 'approved'
WHERE profile_completed = true
  AND NULLIF(TRIM(COALESCE(portrait_url, '')), '') IS NOT NULL
  AND NULLIF(TRIM(COALESCE(fullbody_url, '')), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_photo_verification_status_from_parts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.portrait_photo_status = 'approved' AND NEW.body_photo_status = 'approved' THEN
    NEW.photo_verification_status := 'approved';
  ELSIF NEW.portrait_photo_status = 'rejected' OR NEW.body_photo_status = 'rejected' THEN
    NEW.photo_verification_status := 'rejected';
  ELSE
    NEW.photo_verification_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_photo_verification ON public.profiles;
CREATE TRIGGER trg_profiles_sync_photo_verification
  BEFORE INSERT OR UPDATE OF portrait_photo_status, body_photo_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_photo_verification_status_from_parts();

COMMENT ON FUNCTION public.sync_photo_verification_status_from_parts() IS
  'Dérive photo_verification_status : approved si les deux OK, rejected si l’un est refusé, sinon pending.';

-- Discover / likes : seulement les profils aux photos validées côté produit
CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND COALESCE(p.photo_verification_status, 'pending') = 'approved';

COMMENT ON VIEW public.feed_profiles IS
  'Profils likables : compte auth actif et validation photos approuvée';

GRANT SELECT ON public.feed_profiles TO authenticated;
