-- App utilise uniquement main_photo_url pour l’affichage (Discover, likes, profil, match).
-- portrait_url reste la référence stockage onboarding ; main_photo_url y est aligné à la création.
-- Backfill pour les lignes existantes.

UPDATE public.profiles
SET main_photo_url = NULLIF(TRIM(portrait_url), '')
WHERE (main_photo_url IS NULL OR TRIM(COALESCE(main_photo_url, '')) = '')
  AND portrait_url IS NOT NULL
  AND TRIM(portrait_url) != '';

UPDATE public.profiles
SET main_photo_url = NULLIF(TRIM(avatar_url), '')
WHERE (main_photo_url IS NULL OR TRIM(COALESCE(main_photo_url, '')) = '')
  AND avatar_url IS NOT NULL
  AND TRIM(avatar_url) != '';

COMMENT ON COLUMN public.profiles.main_photo_url IS
  'Photo principale affichée dans l’app (alignée sur portrait_url à l’onboarding)';
