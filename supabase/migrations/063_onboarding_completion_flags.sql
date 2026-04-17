-- Onboarding completion flags used by frontend gating and resume flow.
-- Minimal additive migration for local Docker + Render parity.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.onboarding_completed IS
  'SPLove onboarding completed flag (functional equivalent of profile_completed for onboarding flow).';
COMMENT ON COLUMN public.profiles.onboarding_done IS
  'Legacy-compatible onboarding completion flag kept in sync with onboarding_completed.';

