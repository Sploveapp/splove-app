-- =============================================
-- SPLove — Meetup proposals (DB-first)
-- =============================================

-- 1) Table meetup_proposals
CREATE TABLE IF NOT EXISTS public.meetup_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  location TEXT,
  scheduled_at TIMESTAMPTZ,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT meetup_proposals_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'cancelled', 'expired')),
  CONSTRAINT meetup_proposals_users_distinct_check
    CHECK (proposer_id IS DISTINCT FROM receiver_id)
);

COMMENT ON TABLE public.meetup_proposals IS
  'Propositions d''activité liées à un match. Une seule pending active par match.';

-- 2) Index
CREATE INDEX IF NOT EXISTS idx_meetup_proposals_match_created_desc
  ON public.meetup_proposals (match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetup_proposals_receiver_status
  ON public.meetup_proposals (receiver_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetup_proposals_proposer_status
  ON public.meetup_proposals (proposer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetup_proposals_expires_pending
  ON public.meetup_proposals (expires_at)
  WHERE status = 'pending';

-- 5) Unique index — une seule proposition pending par match
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meetup_proposals_one_pending_per_match
  ON public.meetup_proposals (match_id)
  WHERE status = 'pending';

-- Helpers triggers (updated_at + règles métier)
CREATE OR REPLACE FUNCTION public.touch_meetup_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_meetup_proposals_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_a UUID;
  v_user_b UUID;
BEGIN
  SELECT m.user_a, m.user_b
  INTO v_user_a, v_user_b
  FROM public.matches AS m
  WHERE m.id = NEW.match_id;

  IF v_user_a IS NULL OR v_user_b IS NULL THEN
    RAISE EXCEPTION 'match_id invalide pour meetup proposal';
  END IF;

  IF NEW.proposer_id IS DISTINCT FROM v_user_a
     AND NEW.proposer_id IS DISTINCT FROM v_user_b THEN
    RAISE EXCEPTION 'proposer_id doit être participant du match';
  END IF;

  IF NEW.receiver_id IS DISTINCT FROM v_user_a
     AND NEW.receiver_id IS DISTINCT FROM v_user_b THEN
    RAISE EXCEPTION 'receiver_id doit être participant du match';
  END IF;

  IF NEW.proposer_id = NEW.receiver_id THEN
    RAISE EXCEPTION 'proposer_id et receiver_id doivent être différents';
  END IF;

  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '48 hours';
  END IF;

  -- Expiration automatique sur écriture si la proposition est encore pending.
  IF NEW.status = 'pending' AND NEW.expires_at <= NOW() THEN
    NEW.status := 'expired';
  END IF;

  IF NEW.status IN ('accepted', 'declined', 'cancelled', 'expired') THEN
    NEW.responded_at := COALESCE(NEW.responded_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetup_proposals_updated_at ON public.meetup_proposals;
CREATE TRIGGER trg_meetup_proposals_updated_at
BEFORE UPDATE ON public.meetup_proposals
FOR EACH ROW
EXECUTE FUNCTION public.touch_meetup_proposals_updated_at();

DROP TRIGGER IF EXISTS trg_meetup_proposals_integrity ON public.meetup_proposals;
CREATE TRIGGER trg_meetup_proposals_integrity
BEFORE INSERT OR UPDATE ON public.meetup_proposals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_meetup_proposals_integrity();

-- 3) RLS
ALTER TABLE public.meetup_proposals ENABLE ROW LEVEL SECURITY;

-- 4) Policies
DROP POLICY IF EXISTS "meetup_proposals_select_participants" ON public.meetup_proposals;
CREATE POLICY "meetup_proposals_select_participants"
  ON public.meetup_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = meetup_proposals.match_id
        AND auth.uid() IN (m.user_a, m.user_b)
    )
  );

DROP POLICY IF EXISTS "meetup_proposals_insert_proposer" ON public.meetup_proposals;
CREATE POLICY "meetup_proposals_insert_proposer"
  ON public.meetup_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = proposer_id
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = meetup_proposals.match_id
        AND proposer_id IN (m.user_a, m.user_b)
        AND receiver_id IN (m.user_a, m.user_b)
        AND proposer_id IS DISTINCT FROM receiver_id
    )
  );

DROP POLICY IF EXISTS "meetup_proposals_update_participants" ON public.meetup_proposals;
CREATE POLICY "meetup_proposals_update_participants"
  ON public.meetup_proposals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = meetup_proposals.match_id
        AND auth.uid() IN (m.user_a, m.user_b)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = meetup_proposals.match_id
        AND auth.uid() IN (m.user_a, m.user_b)
        AND proposer_id IN (m.user_a, m.user_b)
        AND receiver_id IN (m.user_a, m.user_b)
        AND proposer_id IS DISTINCT FROM receiver_id
    )
  );

DROP POLICY IF EXISTS "meetup_proposals_delete_proposer_only" ON public.meetup_proposals;
CREATE POLICY "meetup_proposals_delete_proposer_only"
  ON public.meetup_proposals
  FOR DELETE
  TO authenticated
  USING (auth.uid() = proposer_id);

-- 6) Vue my_meetups
CREATE OR REPLACE VIEW public.my_meetups AS
SELECT
  mp.id,
  mp.match_id,
  mp.proposer_id,
  mp.receiver_id,
  mp.sport,
  mp.location,
  mp.scheduled_at,
  mp.message,
  CASE
    WHEN mp.status = 'pending' AND mp.expires_at <= NOW() THEN 'expired'
    ELSE mp.status
  END AS effective_status,
  mp.status AS stored_status,
  mp.expires_at,
  mp.created_at,
  mp.updated_at,
  mp.responded_at
FROM public.meetup_proposals mp
WHERE auth.uid() IN (mp.proposer_id, mp.receiver_id);

COMMENT ON VIEW public.my_meetups IS
  'Vue utilisateur des meetups (proposés/reçus) avec statut effectif (pending expiré -> expired).';
