-- Préférences rapides onboarding (tap) — réduit friction vs phrase libre obligatoire
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sport_intensity TEXT,
  ADD COLUMN IF NOT EXISTS meet_vibe TEXT;

COMMENT ON COLUMN public.profiles.sport_intensity IS 'chill | intense — énergie ressentie';
COMMENT ON COLUMN public.profiles.meet_vibe IS 'fun | real_meeting | both — intention de sortie';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sport_intensity_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sport_intensity_check
  CHECK (sport_intensity IS NULL OR sport_intensity IN ('chill', 'intense'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_meet_vibe_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_meet_vibe_check
  CHECK (meet_vibe IS NULL OR meet_vibe IN ('fun', 'real_meeting', 'both'));
