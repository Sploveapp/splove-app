-- =============================================
-- SPLove — Préférence d’ouverture sportive (Discover)
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sport_match_preference TEXT NOT NULL DEFAULT 'same_sports';

COMMENT ON COLUMN public.profiles.sport_match_preference IS 'Discover : same_sports | open_to_different_sports | both';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sport_match_preference_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sport_match_preference_chk
  CHECK (sport_match_preference IN ('same_sports', 'open_to_different_sports', 'both'));
