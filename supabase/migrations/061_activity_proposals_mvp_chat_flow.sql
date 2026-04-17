-- MVP chat activity proposal flow hardening.
-- Keeps existing table/columns and aligns behavior with:
-- pending | accepted | declined | countered | cancelled.

ALTER TABLE public.activity_proposals
  DROP CONSTRAINT IF EXISTS activity_proposals_status_check;

ALTER TABLE public.activity_proposals
  ADD CONSTRAINT activity_proposals_status_check
  CHECK (
    status IN ('pending', 'accepted', 'declined', 'countered', 'cancelled')
  );

UPDATE public.activity_proposals
SET status = 'pending'
WHERE status = 'proposed';

UPDATE public.activity_proposals
SET status = 'countered'
WHERE status IN ('alternative_requested', 'replaced');

UPDATE public.activity_proposals
SET status = 'cancelled'
WHERE status = 'expired';

ALTER TABLE public.activity_proposals
  ALTER COLUMN status SET DEFAULT 'pending';

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
    auth.uid() = activity_proposals.proposer_id
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

DROP FUNCTION IF EXISTS public.create_activity_proposal(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_activity_proposal(
  p_conversation_id uuid,
  p_sport text,
  p_time_slot text,
  p_location text,
  p_note text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.activity_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_existing public.activity_proposals%ROWTYPE;
  v_row public.activity_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT c.match_id
  INTO v_match_id
  FROM public.conversations c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.id = p_conversation_id
    AND (m.user_a = v_uid OR m.user_b = v_uid)
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'conversation not accessible';
  END IF;

  SELECT ap.*
  INTO v_existing
  FROM public.activity_proposals ap
  WHERE ap.conversation_id = p_conversation_id
    AND ap.status = 'pending'
  ORDER BY ap.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.activity_proposals (
    conversation_id,
    proposer_id,
    match_id,
    sport,
    time_slot,
    location,
    note,
    status,
    scheduled_at
  ) VALUES (
    p_conversation_id,
    v_uid,
    v_match_id,
    NULLIF(TRIM(p_sport), ''),
    NULLIF(TRIM(p_time_slot), ''),
    NULLIF(TRIM(p_location), ''),
    NULLIF(TRIM(p_note), ''),
    'pending',
    COALESCE(p_scheduled_at, NOW() + INTERVAL '1 day')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_activity_proposal(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_activity_proposal(uuid, text, text, text, text, timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.respond_to_activity_proposal(uuid, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.respond_to_activity_proposal(
  p_proposal_id uuid,
  p_action text,
  p_time_slot text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_sport text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.activity_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_next_status text := lower(trim(coalesce(p_action, '')));
  v_prev public.activity_proposals%ROWTYPE;
  v_row public.activity_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_next_status NOT IN ('accepted', 'declined', 'countered') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;

  SELECT ap.*
  INTO v_prev
  FROM public.activity_proposals ap
  WHERE ap.id = p_proposal_id
    AND ap.status = 'pending'
    AND ap.proposer_id IS DISTINCT FROM v_uid
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = ap.conversation_id
        AND (m.user_a = v_uid OR m.user_b = v_uid)
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_next_status = 'countered' THEN
    UPDATE public.activity_proposals ap
    SET
      status = 'countered',
      responded_by = v_uid,
      responded_at = NOW()
    WHERE ap.id = v_prev.id;

    INSERT INTO public.activity_proposals (
      conversation_id,
      proposer_id,
      match_id,
      sport,
      time_slot,
      location,
      note,
      status,
      scheduled_at,
      supersedes_proposal_id
    ) VALUES (
      v_prev.conversation_id,
      v_uid,
      v_prev.match_id,
      COALESCE(NULLIF(TRIM(p_sport), ''), v_prev.sport),
      COALESCE(NULLIF(TRIM(p_time_slot), ''), v_prev.time_slot),
      COALESCE(NULLIF(TRIM(p_location), ''), v_prev.location),
      COALESCE(NULLIF(TRIM(p_note), ''), v_prev.note),
      'pending',
      COALESCE(p_scheduled_at, v_prev.scheduled_at, NOW() + INTERVAL '1 day'),
      v_prev.id
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.activity_proposals ap
    SET
      status = v_next_status,
      responded_by = v_uid,
      responded_at = NOW()
    WHERE ap.id = v_prev.id
    RETURNING ap.* INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_activity_proposal(uuid, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_activity_proposal(uuid, text, text, text, text, text, timestamptz) TO authenticated;
