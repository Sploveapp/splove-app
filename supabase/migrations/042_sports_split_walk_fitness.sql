-- Marche / Randonnée et Fitness / Musculation : entrées séparées au catalogue,
-- matching géré côté app via `sportMatchGroups` (slugs dans le même groupe logique).
-- Les lignes combinées restent en base pour les FK existantes mais ne sont plus proposées à la sélection.

INSERT INTO public.sports (
  name,
  slug,
  label,
  category,
  is_date_friendly,
  is_quick_date,
  is_niche,
  requires_equipment,
  requires_specific_location,
  active
)
SELECT
  v.name,
  v.slug,
  v.label,
  v.cat,
  v.is_df,
  v.is_qd,
  v.is_niche,
  v.req_eq,
  v.req_loc,
  true
FROM (
  VALUES
    ('Marche', 'marche', 'Marche', 'outdoor', false, false, false, false, false),
    ('Randonnée', 'randonnee', 'Randonnée', 'outdoor', false, false, false, false, false),
    ('Fitness', 'fitness', 'Fitness', 'strength', false, false, false, false, false),
    ('Musculation', 'musculation', 'Musculation', 'strength', false, false, false, false, false)
) AS v(name, slug, label, cat, is_df, is_qd, is_niche, req_eq, req_loc)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sports s WHERE lower(trim(s.slug)) = lower(trim(v.slug))
);

UPDATE public.sports
SET active = false
WHERE lower(trim(slug)) IN ('marche-randonnee', 'fitness-musculation');
