-- SPLove — préférences d'âge (Discover réciproque : min/max des deux sens)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_age_min integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS preferred_age_max integer NOT NULL DEFAULT 85;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_age_range_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_age_range_check
  CHECK (
    preferred_age_min >= 18
    AND preferred_age_max >= 18
    AND preferred_age_min <= preferred_age_max
    AND preferred_age_max <= 130
  );

COMMENT ON COLUMN public.profiles.preferred_age_min IS
  'Âge minimum des personnes que l''utilisateur souhaite rencontrer sur Discover.';
COMMENT ON COLUMN public.profiles.preferred_age_max IS
  'Âge maximum des personnes que l''utilisateur souhaite rencontrer sur Discover.';
