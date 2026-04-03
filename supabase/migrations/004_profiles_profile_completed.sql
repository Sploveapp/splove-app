-- =============================================
-- SPLove — Colonne profile_completed (flux d'entrée / onboarding)
-- =============================================
-- Utilisée pour rediriger vers Onboarding si false, vers Discover si true.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_profile_completed
  ON public.profiles (profile_completed)
  WHERE profile_completed = TRUE;

COMMENT ON COLUMN public.profiles.profile_completed IS 'Profil complété (onboarding validé) — accès Discover autorisé si true';
