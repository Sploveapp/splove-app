-- Préférences onboarding : pratique avec aménagements (réponse facultative) + ouverture aux rencontres.

ALTER TABLE public.profiles
  ALTER COLUMN needs_adapted_activities DROP NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS open_to_adapted_activities text;

COMMENT ON COLUMN public.profiles.needs_adapted_activities IS
  'Facultatif : pratique avec aménagements (rythme, matériel, etc.). NULL si la personne préfère ne pas répondre.';
COMMENT ON COLUMN public.profiles.open_to_adapted_activities IS
  'Ouverture à rencontrer quelqu''un avec une pratique adaptée : yes_totally, yes_depends_sport, unsure, no.';
COMMENT ON COLUMN public.profiles.pref_open_to_adapted_activity IS
  'Legacy booléen ; préférez open_to_adapted_activities pour le détail.';

