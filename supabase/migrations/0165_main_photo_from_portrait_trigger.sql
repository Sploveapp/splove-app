-- Canonical rule: `main_photo_url` is always derived from `portrait_url`.
-- Applies to onboarding inserts and any later profile updates.

CREATE OR REPLACE FUNCTION public.set_main_photo_from_portrait()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.main_photo_url := NULLIF(TRIM(COALESCE(NEW.portrait_url, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_main_photo_from_portrait ON public.profiles;
CREATE TRIGGER trg_profiles_main_photo_from_portrait
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_main_photo_from_portrait();

-- Backfill existing rows once.
UPDATE public.profiles
SET main_photo_url = NULLIF(TRIM(COALESCE(portrait_url, '')), '')
WHERE COALESCE(main_photo_url, '') IS DISTINCT FROM COALESCE(NULLIF(TRIM(COALESCE(portrait_url, '')), ''), '');
