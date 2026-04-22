-- =============================================
-- SPLove — Add `profiles.is_seed_demo` marker
-- Safe, additive, idempotent.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_seed_demo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_seed_demo IS
  'Marker for SPLove demo/test seed profiles. Must never be set by normal users.';

