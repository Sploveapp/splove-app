-- ==========================================
-- SPLOVE — MIGRATION 001 (SAFE)
-- Sports + Profile_Sports architecture
-- ==========================================

-- =========================
-- A. TABLE SPORTS
-- =========================

CREATE TABLE IF NOT EXISTS public.sports (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE public.sports
ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.sports
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_sports_slug
ON public.sports (LOWER(TRIM(slug)))
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sports_name_lower
ON public.sports (LOWER(TRIM(name)));

COMMENT ON TABLE public.sports IS
'Catalogue des sports Splove – entité centrale du matching';

-- =========================
-- B. TABLE PROFILE_SPORTS
-- =========================

CREATE TABLE IF NOT EXISTS public.profile_sports (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sport_id BIGINT NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, sport_id)
);

COMMENT ON TABLE public.profile_sports IS
'Sports pratiqués par profil – base du matching par sport';

-- =========================
-- C. INDEX MATCHING
-- =========================

CREATE INDEX IF NOT EXISTS idx_profile_sports_profile
ON public.profile_sports(profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_sports_sport
ON public.profile_sports(sport_id);

CREATE INDEX IF NOT EXISTS idx_profile_sports_match
ON public.profile_sports(sport_id, profile_id);

-- =========================
-- D. RLS SPORTS
-- =========================

ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sports_select_authenticated"
ON public.sports;

CREATE POLICY "sports_select_authenticated"
ON public.sports
FOR SELECT
TO authenticated
USING (true);

-- =========================
-- E. RLS PROFILE_SPORTS
-- =========================

ALTER TABLE public.profile_sports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_sports_select_authenticated"
ON public.profile_sports;

CREATE POLICY "profile_sports_select_authenticated"
ON public.profile_sports
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "profile_sports_insert_own"
ON public.profile_sports;

CREATE POLICY "profile_sports_insert_own"
ON public.profile_sports
FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_sports_update_own"
ON public.profile_sports;

CREATE POLICY "profile_sports_update_own"
ON public.profile_sports
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_sports_delete_own"
ON public.profile_sports;

CREATE POLICY "profile_sports_delete_own"
ON public.profile_sports
FOR DELETE
TO authenticated
USING (profile_id = auth.uid());