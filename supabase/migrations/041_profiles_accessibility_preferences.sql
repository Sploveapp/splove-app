-- Préférences de mise en relation autour des activités adaptées / mobilité (valeurs par défaut inclusives).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pref_open_to_standard_activity BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pref_open_to_adapted_activity BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.needs_adapted_activities IS
  'Facultatif : la personne pratique plutôt des activités adaptées (mobilité, handicap, etc.).';
COMMENT ON COLUMN public.profiles.pref_open_to_standard_activity IS
  'Ouvert aux profils sans besoin particulier d’activités adaptées (défaut true).';
COMMENT ON COLUMN public.profiles.pref_open_to_adapted_activity IS
  'Ouvert aux profils qui indiquent des activités adaptées (défaut true).';
