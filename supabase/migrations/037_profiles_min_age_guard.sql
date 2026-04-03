-- =============================================
-- SPLove — Âge minimum 18 ans (cohérent avec l’app)
-- =============================================
-- Complète la validation front : INSERT/UPDATE sur profiles ne peut pas
-- enregistrer une date de naissance indiquant moins de 18 ans.

CREATE OR REPLACE FUNCTION public.profiles_enforce_min_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    IF NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years') THEN
      RAISE EXCEPTION 'SPLove: l''accès est réservé aux personnes de 18 ans ou plus.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.profile_completed IS TRUE AND NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'SPLove: date de naissance requise pour un profil complété.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_min_age ON public.profiles;

CREATE TRIGGER trg_profiles_enforce_min_age
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_enforce_min_age();

COMMENT ON FUNCTION public.profiles_enforce_min_age() IS
  'Refuse birth_date indiquant moins de 18 ans ; exige birth_date si profile_completed.';
