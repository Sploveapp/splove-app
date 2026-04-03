-- MVP post-match activity proposals (48h flow support).

CREATE TABLE IF NOT EXISTS public.activity_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  proposed_by UUID NOT NULL,
  sport TEXT NOT NULL,
  slot_label TEXT NOT NULL,
  place TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_proposals_status_check
    CHECK (status IN ('pending', 'accepted', 'reschedule', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_activity_proposals_conversation_created
  ON public.activity_proposals (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_activity_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_proposals_updated_at ON public.activity_proposals;
CREATE TRIGGER trg_activity_proposals_updated_at
BEFORE UPDATE ON public.activity_proposals
FOR EACH ROW
EXECUTE FUNCTION public.touch_activity_proposals_updated_at();

ALTER TABLE public.activity_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_proposals_select_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_select_authenticated"
  ON public.activity_proposals
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_insert_authenticated"
  ON public.activity_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = proposed_by);

DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_update_authenticated"
  ON public.activity_proposals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
