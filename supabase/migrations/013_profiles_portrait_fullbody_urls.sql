-- URLs canoniques onboarding (portrait + plein corps)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portrait_url TEXT,
  ADD COLUMN IF NOT EXISTS fullbody_url TEXT;

COMMENT ON COLUMN public.profiles.portrait_url IS 'Photo portrait obligatoire (onboarding)';
COMMENT ON COLUMN public.profiles.fullbody_url IS 'Photo plein corps obligatoire (onboarding)';
