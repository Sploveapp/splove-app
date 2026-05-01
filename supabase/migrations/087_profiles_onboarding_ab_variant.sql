-- A/B onboarding cohort + extended sport_intensity values for cohort copy variants

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_variant TEXT;

COMMENT ON COLUMN public.profiles.onboarding_variant IS 'Onboarding energy question A/B cohort: A | B (assigned once at profile creation).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sport_intensity_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sport_intensity_check CHECK (
    sport_intensity IS NULL OR sport_intensity IN (
      'chill',
      'intense',
      'dynamic',
      'both',
      'active',
      'relaxed',
      'flexible'
    )
  );

COMMENT ON COLUMN public.profiles.sport_intensity IS 'Energy / pace: chill|intense (legacy); onboarding A: dynamic|chill|both; onboarding B: active|relaxed|flexible';

-- Signup trigger runs before the client; assign cohort once here so `onboarding_variant` is never missed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, profile_completed, onboarding_variant)
  VALUES (
    NEW.id,
    false,
    CASE WHEN random() < 0.5 THEN 'A'::text ELSE 'B'::text END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
