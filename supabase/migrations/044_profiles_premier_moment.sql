-- Premier moment : courte phrase d’activité réelle (complément à la phrase guidée).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premier_moment TEXT;

COMMENT ON COLUMN public.profiles.premier_moment IS 'Idée de premier moment IRL en une courte phrase (ex. sortie, activité).';
