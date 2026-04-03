-- =============================================
-- SPLove — Signalements (report system)
-- =============================================

CREATE TABLE IF NOT EXISTS public.reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  details           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_no_self CHECK (reporter_id != reported_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON public.reports (reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports (created_at DESC);

COMMENT ON TABLE public.reports IS 'Signalements de profils (fake, arnaque, prostitution, harcèlement, comportement inapproprié)';

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Pas d'UPDATE/DELETE pour les utilisateurs (modération côté backend)
