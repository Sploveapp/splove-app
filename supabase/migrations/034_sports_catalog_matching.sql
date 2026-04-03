-- =============================================
-- SPLove — Catalogue sports enrichi (matching / suggestions)
-- =============================================
-- Étend public.sports (déjà créée en 001) sans changer le type de id ni profile_sports.

ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_date_friendly BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_quick_date BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_niche BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS requires_equipment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS requires_specific_location BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

UPDATE public.sports
SET label = TRIM(BOTH FROM COALESCE(NULLIF(TRIM(BOTH FROM label), ''), name))
WHERE label IS NULL OR TRIM(BOTH FROM label) = '';

-- Anciens slugs seed 005 → canonique français
UPDATE public.sports
SET
  slug = 'course-a-pied',
  name = 'Course à pied',
  label = 'Course à pied',
  category = 'endurance'
WHERE lower(trim(slug)) = 'running';

UPDATE public.sports
SET
  slug = 'marche-randonnee',
  name = 'Marche / randonnée',
  label = 'Marche / randonnée',
  category = 'outdoor'
WHERE lower(trim(slug)) = 'randonnee';

UPDATE public.sports
SET
  slug = 'fitness-musculation',
  name = 'Fitness / musculation',
  label = 'Fitness / musculation',
  category = 'strength'
WHERE lower(trim(slug)) = 'fitness';

UPDATE public.sports
SET slug = lower(trim(regexp_replace(trim(COALESCE(name, '')), '\s+', '-', 'g')))
WHERE slug IS NULL OR trim(slug) = '';

-- Insertion idempotente (par slug normalisé)
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
SELECT v.name, v.slug, v.label, v.cat, v.is_df, v.is_qd, v.is_niche, v.req_eq, v.req_loc, true
FROM (
  VALUES
    ('Course à pied', 'course-a-pied', 'Course à pied', 'endurance', false, false, false, false, false),
    ('Marche / randonnée', 'marche-randonnee', 'Marche / randonnée', 'outdoor', false, false, false, false, false),
    ('Trail', 'trail', 'Trail', 'endurance', false, false, false, false, false),
    ('Fitness / musculation', 'fitness-musculation', 'Fitness / musculation', 'strength', false, false, false, false, false),
    ('Yoga', 'yoga', 'Yoga', 'studio', false, false, false, false, false),
    ('Pilates', 'pilates', 'Pilates', 'studio', false, false, false, false, false),
    ('Vélo', 'velo', 'Vélo', 'cycling', false, false, false, false, false),
    ('VTT', 'vtt', 'VTT', 'cycling', false, false, false, false, false),
    ('Natation', 'natation', 'Natation', 'aquatic', false, false, false, false, false),
    ('Tennis', 'tennis', 'Tennis', 'racket', false, false, false, false, false),
    ('Padel', 'padel', 'Padel', 'racket', false, false, false, false, false),
    ('Badminton', 'badminton', 'Badminton', 'racket', false, false, false, false, false),
    ('Football', 'football', 'Football', 'team', false, false, false, false, false),
    ('Basketball', 'basketball', 'Basketball', 'team', false, false, false, false, false),
    ('Rugby', 'rugby', 'Rugby', 'team', false, false, false, false, false),
    ('Skate', 'skate', 'Skate', 'urban', false, false, false, false, false),
    ('Roller', 'roller', 'Roller', 'urban', false, false, false, false, false),
    ('Danse', 'danse', 'Danse', 'dance', false, false, false, false, false),
    ('Boxe', 'boxe', 'Boxe', 'combat', false, false, false, false, false),
    ('CrossFit', 'crossfit', 'CrossFit', 'strength', false, false, false, false, false),
    ('Escalade', 'escalade', 'Escalade', 'climbing', false, false, false, false, false),
    ('Surf', 'surf', 'Surf', 'water', false, false, false, false, false),
    ('Paddle', 'paddle', 'Paddle', 'water', false, false, false, false, false),
    ('Ski', 'ski', 'Ski', 'snow', false, false, false, false, false),
    ('Snowboard', 'snowboard', 'Snowboard', 'snow', false, false, false, false, false),
    ('Pétanque', 'petanque', 'Pétanque', 'leisure', true, true, false, false, false),
    ('Longe-côte', 'longe-cote', 'Longe-côte', 'coastal', true, false, true, false, true),
    ('Plongée', 'plongee', 'Plongée', 'water', false, false, true, true, true)
) AS v(name, slug, label, cat, is_df, is_qd, is_niche, req_eq, req_loc)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sports s WHERE lower(trim(s.slug)) = lower(trim(v.slug))
);

-- Resynchronise libellés, catégories et flags métier (idempotent)
UPDATE public.sports s
SET
  name = c.label,
  label = c.label,
  category = c.category,
  is_date_friendly = c.is_df,
  is_quick_date = c.is_qd,
  is_niche = c.is_niche,
  requires_equipment = c.req_eq,
  requires_specific_location = c.req_loc
FROM (
  VALUES
    ('course-a-pied', 'Course à pied', 'endurance', false, false, false, false, false),
    ('marche-randonnee', 'Marche / randonnée', 'outdoor', false, false, false, false, false),
    ('trail', 'Trail', 'endurance', false, false, false, false, false),
    ('fitness-musculation', 'Fitness / musculation', 'strength', false, false, false, false, false),
    ('yoga', 'Yoga', 'studio', false, false, false, false, false),
    ('pilates', 'Pilates', 'studio', false, false, false, false, false),
    ('velo', 'Vélo', 'cycling', false, false, false, false, false),
    ('vtt', 'VTT', 'cycling', false, false, false, false, false),
    ('natation', 'Natation', 'aquatic', false, false, false, false, false),
    ('tennis', 'Tennis', 'racket', false, false, false, false, false),
    ('padel', 'Padel', 'racket', false, false, false, false, false),
    ('badminton', 'Badminton', 'racket', false, false, false, false, false),
    ('football', 'Football', 'team', false, false, false, false, false),
    ('basketball', 'Basketball', 'team', false, false, false, false, false),
    ('rugby', 'Rugby', 'team', false, false, false, false, false),
    ('skate', 'Skate', 'urban', false, false, false, false, false),
    ('roller', 'Roller', 'urban', false, false, false, false, false),
    ('danse', 'Danse', 'dance', false, false, false, false, false),
    ('boxe', 'Boxe', 'combat', false, false, false, false, false),
    ('crossfit', 'CrossFit', 'strength', false, false, false, false, false),
    ('escalade', 'Escalade', 'climbing', false, false, false, false, false),
    ('surf', 'Surf', 'water', false, false, false, false, false),
    ('paddle', 'Paddle', 'water', false, false, false, false, false),
    ('ski', 'Ski', 'snow', false, false, false, false, false),
    ('snowboard', 'Snowboard', 'snow', false, false, false, false, false),
    ('petanque', 'Pétanque', 'leisure', true, true, false, false, false),
    ('longe-cote', 'Longe-côte', 'coastal', true, false, true, false, true),
    ('plongee', 'Plongée', 'water', false, false, true, true, true)
) AS c(sl, label, category, is_df, is_qd, is_niche, req_eq, req_loc)
WHERE lower(trim(s.slug)) = lower(trim(c.sl));

UPDATE public.sports SET label = name WHERE label IS NULL OR trim(label) = '';
UPDATE public.sports SET slug = 'sport-' || id::text WHERE slug IS NULL OR trim(slug) = '';

ALTER TABLE public.sports ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.sports ALTER COLUMN label SET NOT NULL;

DROP INDEX IF EXISTS idx_sports_slug;
CREATE UNIQUE INDEX IF NOT EXISTS sports_label_key ON public.sports (label);
CREATE UNIQUE INDEX IF NOT EXISTS sports_slug_lower_key ON public.sports (lower(trim(slug)));

COMMENT ON COLUMN public.sports.label IS 'Libellé affichage unique (FR)';
COMMENT ON COLUMN public.sports.category IS 'Famille pour matching / suggestions (ex. racket, water)';
COMMENT ON COLUMN public.sports.is_date_friendly IS 'Adapté à une première rencontre simple';
COMMENT ON COLUMN public.sports.is_quick_date IS 'Peut se faire sur un créneau court sans grosse orga';
COMMENT ON COLUMN public.sports.is_niche IS 'Pratique ou lieu plus rare / moins mainstream';
COMMENT ON COLUMN public.sports.requires_equipment IS 'Matériel spécifique souvent nécessaire';
COMMENT ON COLUMN public.sports.requires_specific_location IS 'Dépend d’un lieu type (piscine, spot mer, salle, etc.)';
COMMENT ON COLUMN public.sports.active IS 'Visible onboarding et filtres';
