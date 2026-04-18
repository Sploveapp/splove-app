-- Préférence organisation (spontané / planifié) — onboarding écran « Ton style »
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS planning_style TEXT;

COMMENT ON COLUMN public.profiles.planning_style IS 'spontaneous | planned';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_planning_style_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_planning_style_check
  CHECK (planning_style IS NULL OR planning_style IN ('spontaneous', 'planned'));
