-- Annulation (cancelled), lien contre-proposition (supersedes_proposal_id), indicateur de frappe.

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
      'cancelled',
      'alternative_requested',
      'replaced',
      'countered'
    )
  );

ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS supersedes_proposal_id UUID REFERENCES public.activity_proposals (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.conversation_typing (
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_typing_select_participants" ON public.conversation_typing;
CREATE POLICY "conversation_typing_select_participants"
  ON public.conversation_typing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_typing.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversation_typing_insert_own" ON public.conversation_typing;
CREATE POLICY "conversation_typing_insert_own"
  ON public.conversation_typing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_typing.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversation_typing_update_own" ON public.conversation_typing;
CREATE POLICY "conversation_typing_update_own"
  ON public.conversation_typing
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.conversation_typing TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_activity_proposal(p_proposal_id uuid)
RETURNS public.activity_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.activity_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.activity_proposals ap
  SET
    status = 'cancelled',
    responded_by = v_uid,
    responded_at = NOW()
  WHERE ap.id = p_proposal_id
    AND ap.status IN ('pending', 'proposed')
    AND ap.proposer_id = v_uid
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = ap.conversation_id
        AND (m.user_a = v_uid OR m.user_b = v_uid)
    )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_activity_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_activity_proposal(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.respond_to_activity_proposal(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.respond_to_activity_proposal(
  p_proposal_id uuid,
  p_action text,
  p_time_slot text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_sport text DEFAULT NULL
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
      coalesce(nullif(trim(p_sport), ''), v_prev.sport),
      coalesce(nullif(trim(p_time_slot), ''), v_prev.time_slot),
      coalesce(nullif(trim(p_location), ''), v_prev.location),
      coalesce(nullif(trim(p_note), ''), v_prev.note),
      'pending',
      coalesce(v_prev.scheduled_at, NOW() + INTERVAL '48 hours'),
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

REVOKE ALL ON FUNCTION public.respond_to_activity_proposal(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_activity_proposal(uuid, text, text, text, text, text) TO authenticated;

-- Realtime : ajouter `conversation_typing` à la publication supabase_realtime via le dashboard
-- (Database → Replication) si l’indicateur de frappe ne se met pas à jour en direct.
