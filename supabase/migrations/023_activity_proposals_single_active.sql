-- Product rule:
-- At most one ACTIVE activity proposal per conversation (status = 'proposed').
-- We keep full history by allowing multiple rows for all other statuses.
--
-- Safety for existing data:
-- If multiple 'proposed' rows already exist for one conversation, keep the newest as active
-- and mark older ones as 'expired' so the partial unique index can be created safely.

WITH ranked AS (
  SELECT
    id,
    conversation_id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.activity_proposals
  WHERE conversation_id IS NOT NULL
    AND status = 'proposed'
)
UPDATE public.activity_proposals ap
SET
  status = 'expired',
  responded_at = COALESCE(ap.responded_at, NOW())
FROM ranked r
WHERE ap.id = r.id
  AND r.rn > 1;

-- Partial unique index: only one proposed row per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_proposals_one_proposed_per_conversation
  ON public.activity_proposals (conversation_id)
  WHERE status = 'proposed';
