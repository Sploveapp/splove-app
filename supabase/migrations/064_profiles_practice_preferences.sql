-- Optional, non-stigmatizing onboarding practice preferences
-- used by step 8 without blocking flow.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS practice_preferences TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.practice_preferences IS
  'Optional onboarding practice preferences: gentle_activities, slow_pace, accessible_venue, avoid_stairs, low_impact, discuss_case_by_case';

