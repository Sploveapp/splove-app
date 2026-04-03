-- =============================================
-- SPLove+ — Complétion schéma (likes, contraintes, index, évolution)
-- =============================================
-- Prérequis : 001 (sports, profile_sports), 002 (subscriptions, profile_boosts, profile_verifications, activity_availability, profiles.passport_city, profiles.available_now_until)

-- =========================
-- A. TABLE LIKES (si absente)
-- =========================
CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT likes_no_self CHECK (from_user != to_user),
  UNIQUE (from_user, to_user)
);

CREATE INDEX IF NOT EXISTS idx_likes_to_user_created
  ON public.likes (to_user, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_from_user
  ON public.likes (from_user);

COMMENT ON TABLE public.likes IS 'Likes entre profils — base pour Qui m''a liké et matching';

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "likes_select_own_or_received" ON public.likes;
CREATE POLICY "likes_select_own_or_received"
  ON public.likes FOR SELECT
  TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid());

DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (from_user = auth.uid());

DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
CREATE POLICY "likes_delete_own"
  ON public.likes FOR DELETE
  TO authenticated
  USING (from_user = auth.uid());

-- =========================
-- B. SUBSCRIPTIONS — contraintes + évolution
-- =========================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('active', 'canceled', 'expired', 'past_due'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_plan_check'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ('plus'));
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.external_id IS 'ID abonnement côté fournisseur (ex. Stripe)';
COMMENT ON COLUMN public.subscriptions.provider IS 'Fournisseur de paiement (ex. stripe)';

-- =========================
-- C. PROFILE_BOOSTS — contrainte
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_boosts_ends_after_start'
    AND conrelid = 'public.profile_boosts'::regclass
  ) THEN
    ALTER TABLE public.profile_boosts
      ADD CONSTRAINT profile_boosts_ends_after_start
      CHECK (ends_at > starts_at);
  END IF;
END $$;

-- =========================
-- D. PROFILE_VERIFICATIONS — contrainte
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_verifications_status_check'
    AND conrelid = 'public.profile_verifications'::regclass
  ) THEN
    ALTER TABLE public.profile_verifications
      ADD CONSTRAINT profile_verifications_status_check
      CHECK (status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- =========================
-- E. PROFILES — index radar « disponibles maintenant »
-- =========================
CREATE INDEX IF NOT EXISTS idx_profiles_available_now
  ON public.profiles (available_now_until)
  WHERE available_now_until IS NOT NULL;

COMMENT ON COLUMN public.profiles.available_now_until IS 'Fin de la plage « dispo maintenant » — radar SPLove+';
COMMENT ON COLUMN public.profiles.passport_city IS 'Ville de découverte (passeport sportif) — SPLove+';
