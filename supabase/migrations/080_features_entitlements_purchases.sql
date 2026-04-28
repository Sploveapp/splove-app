-- Catalogue de features, droits utilisateur (hors abo global), achats unitaires.
-- Règles produit (côté application, via user_has_feature) :
-- - SPLove+ actif → toutes les features listées actives
-- - Sinon → droit explicite dans user_entitlements (bêta, essai, achat, etc.)
-- Les swipes Discover ne sont pas modifiés par cette migration.

-- ---------------------------------------------------------------------------
-- 1) Catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_features_category ON public.features (category)
  WHERE category IS NOT NULL;

COMMENT ON TABLE public.features IS
  'Catalogue produit des features (paywall, réglages, AB).';

-- ---------------------------------------------------------------------------
-- 2) Droits par utilisateur (complément abonnement global SPLove+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features (key) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('free', 'beta', 'subscription', 'purchase')),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_entitlements_pair_unique UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user ON public.user_entitlements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_feature ON public.user_entitlements (feature_key);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_expires
  ON public.user_entitlements (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.user_entitlements IS
  'Droit d’accès à une feature sans passer par l’abonnement SPLove+ (bêta, achat, promo, etc.).';

-- ---------------------------------------------------------------------------
-- 3) Achats unitaires (historique / facturation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features (key) ON DELETE RESTRICT,
  price_paid numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_purchases_user_created
  ON public.feature_purchases (user_id, created_at DESC);

COMMENT ON TABLE public.feature_purchases IS
  'Lignes d’achat in-app d’une feature (débit réel) — les droits courants restent dans user_entitlements.';

-- ---------------------------------------------------------------------------
-- 4) Seed
-- ---------------------------------------------------------------------------
INSERT INTO public.features (key, label, description, category, is_active)
VALUES (
  'second_chance_return',
  'Seconde chance',
  'Revisiter un profil déjà vu et tenter un nouveau match',
  'engagement',
  true
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "features_select_authenticated" ON public.features;
CREATE POLICY "features_select_authenticated"
  ON public.features FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_entitlements_select_own" ON public.user_entitlements;
CREATE POLICY "user_entitlements_select_own"
  ON public.user_entitlements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "feature_purchases_select_own" ON public.feature_purchases;
CREATE POLICY "feature_purchases_select_own"
  ON public.feature_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Pas d’INSERT/UPDATE direct côté client (Edge functions / service role / RPC dédiés)

GRANT SELECT ON public.features TO authenticated;
GRANT SELECT ON public.user_entitlements TO authenticated;
GRANT SELECT ON public.feature_purchases TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) user_has_feature : SPLove+ OU entitlement valide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_feature(p_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_active boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RETURN false;
  END IF;

  SELECT f.is_active
  INTO v_active
  FROM public.features f
  WHERE f.key = p_feature_key
  LIMIT 1;

  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  -- Abonnement global SPLove+ (y compris bêta / parrainage / essai tels qu’encodés aujourd’hui)
  IF public.discover_user_has_splove_plus(v_uid) THEN
    RETURN true;
  END IF;

  -- Droit explicite (bêta ciblée, achat, subscription feature-level, offre free)
  RETURN EXISTS (
    SELECT 1
    FROM public.user_entitlements e
    WHERE e.user_id = v_uid
      AND e.feature_key = p_feature_key
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_feature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO service_role;

COMMENT ON FUNCTION public.user_has_feature(text) IS
  'true si la feature est active et (SPLove+ actif ou entitlement non expiré).';
