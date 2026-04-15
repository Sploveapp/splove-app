-- Géolocalisation Discover : coords + rayon + ville (feed_profiles = profiles.*).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discovery_radius_km INTEGER;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.city IS 'Ville affichée / secours si pas de lat-lng';
COMMENT ON COLUMN public.profiles.latitude IS 'Dernière latitude connue (WGS84), optionnel';
COMMENT ON COLUMN public.profiles.longitude IS 'Dernière longitude connue (WGS84), optionnel';
COMMENT ON COLUMN public.profiles.discovery_radius_km IS 'Rayon max Discover en km ; NULL = pas de filtre géographique';
COMMENT ON COLUMN public.profiles.location_updated_at IS 'Dernière mise à jour coords (ex. GPS)';
