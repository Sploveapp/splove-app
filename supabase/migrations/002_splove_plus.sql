-- =============================================
-- SPLove+ — Tables premium (MVP+)
-- =============================================
-- Prérequis : profiles (id UUID), likes (from_user, to_user)

-- =========================
-- A. SUBSCRIPTIONS
-- =========================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'plus',
  status        TEXT NOT NULL DEFAULT 'active',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_profile_active
  ON public.subscriptions (profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
  ON public.subscriptions (ends_at)
  WHERE ends_at IS NOT NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- =========================
-- B. PROFILE_BOOSTS
-- =========================
CREATE TABLE IF NOT EXISTS public.profile_boosts (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at      TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_boosts_profile
  ON public.profile_boosts (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_boosts_ends_at
  ON public.profile_boosts (ends_at);

ALTER TABLE public.profile_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_boosts_select_own" ON public.profile_boosts;
CREATE POLICY "profile_boosts_select_own"
  ON public.profile_boosts FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- =========================
-- C. PROFILE_VERIFICATIONS
-- =========================
CREATE TABLE IF NOT EXISTS public.profile_verifications (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_verifications_status
  ON public.profile_verifications (status);

ALTER TABLE public.profile_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_verifications_select_all" ON public.profile_verifications;
CREATE POLICY "profile_verifications_select_all"
  ON public.profile_verifications FOR SELECT
  TO authenticated
  USING (true);

-- =========================
-- D. ACTIVITY_AVAILABILITY (agenda sportif)
-- =========================
CREATE TABLE IF NOT EXISTS public.activity_availability (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL,
  start_time    TIME,
  end_time      TIME,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_activity_availability_profile
  ON public.activity_availability (profile_id);

ALTER TABLE public.activity_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_availability_select_all" ON public.activity_availability;
CREATE POLICY "activity_availability_select_all"
  ON public.activity_availability FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "activity_availability_insert_own" ON public.activity_availability;
CREATE POLICY "activity_availability_insert_own"
  ON public.activity_availability FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "activity_availability_update_own" ON public.activity_availability;
CREATE POLICY "activity_availability_update_own"
  ON public.activity_availability FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "activity_availability_delete_own" ON public.activity_availability;
CREATE POLICY "activity_availability_delete_own"
  ON public.activity_availability FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- =========================
-- E. PROFILES — colonnes premium (optionnel)
-- =========================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS available_now_until TIMESTAMPTZ;

COMMENT ON TABLE public.subscriptions IS 'Abonnements SPLove+';
COMMENT ON TABLE public.profile_boosts IS 'Boosts de visibilité (30 min)';
COMMENT ON TABLE public.profile_verifications IS 'Badge profil vérifié';
COMMENT ON TABLE public.activity_availability IS 'Créneaux habituels (agenda sportif)';
