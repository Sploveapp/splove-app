-- Onboarding step 1 : taille en centimètres (optionnelle).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm SMALLINT;

COMMENT ON COLUMN public.profiles.height_cm IS 'Taille en centimètres (optionnelle, 100-250).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_height_cm_range_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_height_cm_range_check
  CHECK (height_cm IS NULL OR (height_cm BETWEEN 100 AND 250));
