-- Ordre Discover (secondaire après affinité sports)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.profiles.created_at IS 'Date de création du profil — tri Discover';
