-- Onboarding « Ton organisation » : ajout d’une troisième valeur 'both' (Les deux).
-- La contrainte précédente (migration 068) n’autorisait que NULL | 'spontaneous' | 'planned'.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_planning_style_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_planning_style_check
  CHECK (planning_style IS NULL OR planning_style IN ('spontaneous', 'planned', 'both'));

COMMENT ON COLUMN public.profiles.planning_style IS 'spontaneous | planned | both';
