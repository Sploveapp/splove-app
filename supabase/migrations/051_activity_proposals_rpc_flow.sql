-- RPCs minimales pour fiabiliser le flow proposition/réponse côté front.
-- - create_activity_proposal : une seule ligne pending par conversation (retourne l'existante sinon)
-- - respond_to_activity_proposal : accepted/declined/countered avec responded_by/responded_at

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_per_conversation
  ON public.activity_proposals (conversation_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.create_activity_proposal(
  p_conversation_id UUID,
  p_sport TEXT,
  p_time_slot TEXT,
  p_location TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.activity_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match_id UUID;
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
    COALESCE(NULLIF(TRIM(p_location), ''), 'À définir'),
    NULLIF(TRIM(p_note), ''),
    'pending',
    NOW() + INTERVAL '48 hours'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_activity_proposal(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_activity_proposal(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_activity_proposal(
  p_proposal_id UUID,
  p_action TEXT,
  p_time_slot TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS public.activity_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_next_status TEXT := LOWER(TRIM(COALESCE(p_action, '')));
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
      scheduled_at
    ) VALUES (
      v_prev.conversation_id,
      v_uid,
      v_prev.match_id,
      v_prev.sport,
      COALESCE(NULLIF(TRIM(p_time_slot), ''), v_prev.time_slot),
      COALESCE(NULLIF(TRIM(p_location), ''), v_prev.location),
      COALESCE(NULLIF(TRIM(p_note), ''), v_prev.note),
      'pending',
      COALESCE(v_prev.scheduled_at, NOW() + INTERVAL '48 hours')
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

REVOKE ALL ON FUNCTION public.respond_to_activity_proposal(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_activity_proposal(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
