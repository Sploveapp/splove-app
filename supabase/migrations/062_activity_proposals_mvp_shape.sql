-- MVP activity proposals schema (minimal + compatible with existing deployments)
-- Target shape:
-- id, conversation_id, proposer_id, sport, place, scheduled_at, status, counter_of,
-- responded_by, responded_at, created_at

CREATE TABLE IF NOT EXISTS public.activity_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport text NOT NULL,
  place text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  counter_of uuid NULL REFERENCES public.activity_proposals(id) ON DELETE SET NULL,
  responded_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS place text,
  ADD COLUMN IF NOT EXISTS counter_of uuid,
  ADD COLUMN IF NOT EXISTS proposer_id uuid,
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS sport text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS responded_by uuid,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.activity_proposals
SET place = COALESCE(NULLIF(TRIM(place), ''), NULLIF(TRIM(location), ''), 'À définir')
WHERE place IS NULL OR TRIM(place) = '';

UPDATE public.activity_proposals
SET counter_of = supersedes_proposal_id
WHERE counter_of IS NULL AND supersedes_proposal_id IS NOT NULL;

UPDATE public.activity_proposals
SET status = 'pending'
WHERE status IS NULL OR status IN ('proposed');

UPDATE public.activity_proposals
SET status = 'countered'
WHERE status IN ('alternative_requested', 'replaced');

UPDATE public.activity_proposals
SET status = 'cancelled'
WHERE status = 'expired';

ALTER TABLE public.activity_proposals
  ALTER COLUMN place SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_status_check;

ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'cancelled'));

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_conversation_id_fkey;
ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_proposer_id_fkey;
ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_proposer_id_fkey
  FOREIGN KEY (proposer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_counter_of_fkey;
ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_counter_of_fkey
  FOREIGN KEY (counter_of) REFERENCES public.activity_proposals(id) ON DELETE SET NULL;

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_responded_by_fkey;
ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_responded_by_fkey
  FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.activity_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_proposals_select_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_select_authenticated"
  ON public.activity_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = activity_proposals.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_insert_authenticated"
  ON public.activity_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    proposer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = activity_proposals.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
CREATE POLICY "activity_proposals_update_authenticated"
  ON public.activity_proposals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = activity_proposals.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = activity_proposals.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

