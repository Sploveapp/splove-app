-- Flow produit : une seule proposition « active » par conversation, statut canonique `pending`.
-- États de fin / remplacements : accepted, declined, expired, replaced, countered, alternative_requested.
-- Migre `proposed` → `pending`, index unique partiel sur pending, policies UPDATE pour pending + réponses.

-- 1) Assouplir et réécrire la contrainte de statuts
ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_status_check;

ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_status_check
  CHECK (
    status IN (
      'pending',
      'proposed',
      'accepted',
      'declined',
      'expired',
      'alternative_requested',
      'replaced',
      'countered'
    )
  );

-- 2) Au plus une ligne « ouverte » par conversation avant passage à pending unique
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.activity_proposals
  WHERE conversation_id IS NOT NULL
    AND status IN ('proposed', 'pending')
)
UPDATE public.activity_proposals ap
SET
  status = 'expired',
  responded_at = COALESCE(ap.responded_at, NOW())
FROM ranked r
WHERE ap.id = r.id
  AND r.rn > 1;

-- 3) Canonique : actif = pending
UPDATE public.activity_proposals
SET status = 'pending'
WHERE status = 'proposed';

ALTER TABLE public.activity_proposals
  ALTER COLUMN status SET DEFAULT 'pending';

DROP INDEX IF EXISTS uq_activity_proposals_one_proposed_per_conversation;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_proposals_one_pending_per_conversation
  ON public.activity_proposals (conversation_id)
  WHERE status = 'pending';

-- 4) Policy UPDATE : répondant peut passer pending → accepted | declined | replaced | countered | alternative_requested
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposed_by'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        (status IN ('pending', 'proposed') OR status IS NULL)
        AND auth.uid() IS DISTINCT FROM proposed_by
        
        
        AND EXISTS (
  SELECT 1
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = activity_proposals.conversation_id
    AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
)
      )
      WITH CHECK (
        status IN ('accepted', 'declined', 'alternative_requested', 'replaced', 'countered')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
        
        
        AND EXISTS (
  SELECT 1
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = activity_proposals.conversation_id
    AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
)
      );

  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposer_id'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        (status IN ('pending', 'proposed') OR status IS NULL)
        AND auth.uid() IS DISTINCT FROM proposer_id
        AND (
  activity_proposals.conversation_id IS NULL
  OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
  SELECT 1
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = activity_proposals.conversation_id
    AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
)
      )
      WITH CHECK (
        status IN ('accepted', 'declined', 'alternative_requested', 'replaced', 'countered')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
        
        
        AND EXISTS (
  SELECT 1
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = activity_proposals.conversation_id
    AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
)
      );
  ELSE
    RAISE NOTICE '050_activity_proposals_pending_flow: ni proposed_by ni proposer_id — policy UPDATE inchangée.';
  END IF;
END $$;
