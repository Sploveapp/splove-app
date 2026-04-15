-- =============================================
-- SPLove — Table public.matches (base, avant 009_matches_rls)
-- Colonnes alignées sur les INSERT des RPC (ex. 025) : pas d’ALTER ultérieur dédié.
-- =============================================

CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiator_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT matches_no_self CHECK (user_a IS DISTINCT FROM user_b)
);

COMMENT ON TABLE public.matches IS 'Match entre deux profils (paire user_a / user_b ; pas d’auto-match).';
