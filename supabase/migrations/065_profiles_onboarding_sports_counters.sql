-- Derived counters for onboarding gating: selected sports + sports with intensity.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_sports_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_sports_with_level_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.onboarding_sports_count IS
  'Count of selected sports at onboarding completion.';
COMMENT ON COLUMN public.profiles.onboarding_sports_with_level_count IS
  'Count of selected sports with non-empty intensity level.';

