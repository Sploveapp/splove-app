-- Synchronise `messages.metadata` (payload dénormalisé) depuis `activity_proposals` pour les bulles structurées.

CREATE OR REPLACE FUNCTION public.sync_activity_proposal_message_metadata(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ap public.activity_proposals%ROWTYPE;
BEGIN
  SELECT * INTO ap FROM public.activity_proposals WHERE id = p_proposal_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.messages m
  SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'sport', ap.sport,
    'location', ap.location,
    'time', ap.time_slot,
    'status', ap.status,
    'proposer_id', ap.proposer_id,
    'responded_by', ap.responded_by,
    'responded_at', ap.responded_at,
    'sport_label', ap.sport,
    'location_label', ap.location,
    'scheduled_at_label', ap.time_slot
  )
  WHERE m.activity_proposal_id = p_proposal_id
    AND m.message_type = 'activity_proposal';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_activity_proposal_message_metadata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_activity_proposal_message_metadata(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_activity_proposal_message_metadata(uuid) IS
  'Met à jour le payload JSON (metadata) des messages activity_proposal pour refléter la ligne activity_proposals.';
