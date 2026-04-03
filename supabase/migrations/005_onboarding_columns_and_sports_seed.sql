-- =============================================
-- SPLove — Colonnes onboarding + seed sports
-- =============================================

-- Colonnes profiles pour l'onboarding (matching par sport, âge, intention)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS looking_for TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS needs_adapted_activities BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.birth_date IS 'Date de naissance — vérification 18+';
COMMENT ON COLUMN public.profiles.gender IS 'Genre : Femme, Homme, Non-binaire';
COMMENT ON COLUMN public.profiles.looking_for IS 'Intéressé par : Homme, Femme, Tous';
COMMENT ON COLUMN public.profiles.intent IS 'Type de rencontre : Amical, Amoureux';
COMMENT ON COLUMN public.profiles.needs_adapted_activities IS 'Activités adaptées — accessibilité';

-- Seed des sports d'onboarding (uniquement si aucun sport avec ce slug n'existe)
INSERT INTO public.sports (name, slug)
SELECT v.name, v.slug
FROM (VALUES
  ('Skate', 'skate'),
  ('Running', 'running'),
  ('Randonnée', 'randonnee'),
  ('Vélo', 'velo'),
  ('Surf', 'surf'),
  ('Escalade', 'escalade'),
  ('Fitness', 'fitness')
) AS v(name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sports s
  WHERE LOWER(TRIM(COALESCE(s.slug, ''))) = LOWER(TRIM(v.slug))
);
