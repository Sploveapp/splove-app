-- Avatar affichage Discover + critère de complétude app

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL photo profil principale (obligatoire pour accès app)';

UPDATE public.profiles
SET avatar_url = COALESCE(
  NULLIF(TRIM(COALESCE(portrait_url, '')), ''),
  NULLIF(TRIM(COALESCE(main_photo_url, '')), '')
)
WHERE (avatar_url IS NULL OR TRIM(COALESCE(avatar_url, '')) = '')
  AND COALESCE(
    NULLIF(TRIM(COALESCE(portrait_url, '')), ''),
    NULLIF(TRIM(COALESCE(main_photo_url, '')), '')
  ) IS NOT NULL;
