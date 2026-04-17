-- activity_proposals V2: structured and analytics-ready.

ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS match_id UUID,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill skipped: matches has no conversation_id column in this schema.

-- Backfill placeholder schedule and place for existing rows.
UPDATE public.activity_proposals
SET scheduled_at = COALESCE(scheduled_at, created_at + INTERVAL '48 hours');

UPDATE public.activity_proposals
SET place = COALESCE(NULLIF(TRIM(place), ''), 'À définir');

ALTER TABLE public.activity_proposals
  ALTER COLUMN scheduled_at SET NOT NULL,
  ALTER COLUMN place SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'proposed',
  ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE public.activity_proposals
  ALTER COLUMN match_id SET NOT NULL;

ALTER TABLE public.activity_proposals
  DROP COLUMN IF EXISTS slot_label;

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_match_id_fkey;
ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

-- Map old statuses to new canonical statuses.
UPDATE public.activity_proposals SET status = 'proposed' WHERE status = 'pending';
UPDATE public.activity_proposals SET status = 'alternative_requested' WHERE status = 'reschedule';

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_status_check;

ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_status_check
  CHECK (status IN ('proposed', 'accepted', 'alternative_requested', 'declined', 'expired'));

CREATE INDEX IF NOT EXISTS idx_activity_proposals_match_created
  ON public.activity_proposals (match_id, created_at DESC);

DROP POLICY IF EXISTS "activity_proposals_select_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_select_authenticated"
  ON public.activity_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE (m.id = activity_proposals.match_id)
         
        AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
    )
  );

DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_insert_authenticated"
  ON public.activity_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE (m.id = activity_proposals.match_id)
        -- conversation fallback disabled (no conversation_id on matches)
        AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
    )
  );

DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_update_authenticated"
  ON public.activity_proposals
  FOR UPDATE
  TO authenticated
  USING (
    status = 'proposed'
    AND auth.uid() <> proposed_by
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE (m.id = activity_proposals.match_id)
         
        AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
    )
  )
  WITH CHECK (
    status IN ('accepted', 'alternative_requested', 'declined')
    AND responded_by = auth.uid()
    AND responded_at IS NOT NULL
  );
