-- Fix respond_to_activity_proposal for counter-proposals (400 on countered).
-- Causes addressed:
-- - status filter only 'pending' (misses legacy 'proposed')
-- - INSERT omitted `place` (NOT NULL after 062) while setting `location` only
-- - ambiguous function overloads (PostgREST 400)
-- - match_id null on some rows

-- Keep legacy columns used by RPC / client selects
ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS time_slot text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS supersedes_proposal_id uuid REFERENCES public.activity_proposals (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.activity_proposals
SET place = COALESCE(NULLIF(TRIM(place), ''), NULLIF(TRIM(location), ''), 'À définir')
WHERE place IS NULL OR TRIM(place) = '';

UPDATE public.activity_proposals
SET counter_of = supersedes_proposal_id
WHERE counter_of IS NULL AND supersedes_proposal_id IS NOT NULL;

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
      'countered',
      'cancelled',
      'expired',
      'reschedule_requested',
      'alternative_requested',
      'replaced'
    )
  );

DROP FUNCTION IF EXISTS public.respond_to_activity_proposal (uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.respond_to_activity_proposal (uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.respond_to_activity_proposal (uuid, text, text, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.respond_to_activity_proposal (
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
  v_match_id uuid;
  v_place text;
  v_location text;
  v_time_slot text;
  v_scheduled timestamptz;
  v_sport text;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;

  IF v_next_status IN ('counter', 'reschedule_requested', 'counter_proposed', 'alternative_requested', 'replaced') THEN
    v_next_status := 'countered';
  END IF;

  IF v_next_status NOT IN ('accepted', 'declined', 'countered') THEN
    RAISE EXCEPTION 'invalid action: %', coalesce(p_action, '') USING ERRCODE = '22023';
  END IF;

  SELECT ap.*
  INTO v_prev
  FROM public.activity_proposals ap
  WHERE ap.id = p_proposal_id
    AND ap.status IN ('pending', 'proposed')
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
    RAISE EXCEPTION 'proposal_not_found_or_not_counterable' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.match_id
  INTO v_match_id
  FROM public.conversations c
  WHERE c.id = v_prev.conversation_id
  LIMIT 1;

  v_match_id := COALESCE(v_prev.match_id, v_match_id);
  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'conversation_match_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_next_status = 'countered' THEN
    v_place := COALESCE(
      NULLIF(trim(p_location), ''),
      NULLIF(trim(v_prev.place), ''),
      NULLIF(trim(v_prev.location), ''),
      'À définir'
    );
    v_location := COALESCE(NULLIF(trim(p_location), ''), NULLIF(trim(v_prev.location), ''), v_place);
    v_time_slot := COALESCE(
      NULLIF(trim(p_time_slot), ''),
      NULLIF(trim(v_prev.time_slot), ''),
      'À confirmer'
    );
    v_scheduled := COALESCE(p_scheduled_at, v_prev.scheduled_at, NOW() + INTERVAL '1 day');
    v_sport := COALESCE(NULLIF(trim(p_sport), ''), NULLIF(trim(v_prev.sport), ''), 'Activité');
    v_note := COALESCE(NULLIF(trim(p_note), ''), NULLIF(trim(v_prev.note), ''));

    UPDATE public.activity_proposals ap
    SET
      status = 'countered',
      responded_by = v_uid,
      responded_at = NOW()
    WHERE ap.id = v_prev.id
      AND ap.status IN ('pending', 'proposed');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'proposal_status_changed' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.activity_proposals (
      conversation_id,
      proposer_id,
      match_id,
      sport,
      time_slot,
      location,
      place,
      note,
      status,
      scheduled_at,
      expires_at,
      supersedes_proposal_id,
      counter_of
    ) VALUES (
      v_prev.conversation_id,
      v_uid,
      v_match_id,
      v_sport,
      v_time_slot,
      v_location,
      v_place,
      NULLIF(v_note, ''),
      'pending',
      v_scheduled,
      COALESCE(v_prev.expires_at, NOW() + INTERVAL '48 hours'),
      v_prev.id,
      v_prev.id
    )
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  UPDATE public.activity_proposals ap
  SET
    status = v_next_status,
    responded_by = v_uid,
    responded_at = NOW()
  WHERE ap.id = v_prev.id
    AND ap.status IN ('pending', 'proposed')
  RETURNING ap.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_status_changed' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_activity_proposal (uuid, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_activity_proposal (uuid, text, text, text, text, text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.respond_to_activity_proposal (uuid, text, text, text, text, text, timestamptz) IS
  'Réponse à une proposition: accepted | declined | countered. countered = ancienne ligne countered + nouvelle pending (liée).';
