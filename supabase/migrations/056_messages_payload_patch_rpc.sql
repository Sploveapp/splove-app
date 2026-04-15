-- Colonne `payload` (JSONB) + RPC pour fusionner un patch sur le message source `activity_proposal`
-- sans exposer UPDATE générique côté client.

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS payload JSONB;

    COMMENT ON COLUMN public.messages.payload IS
      'État structuré proposition (sport, time, location, status, created_by, response, etc.) — source de vérité affichage.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.patch_activity_proposal_source_message_payload(
  p_conversation_id uuid,
  p_activity_proposal_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.messages m
  SET payload = COALESCE(m.payload, '{}'::jsonb) || p_patch
  WHERE m.conversation_id = p_conversation_id
    AND m.activity_proposal_id = p_activity_proposal_id
    AND m.message_type = 'activity_proposal'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches ma ON ma.id = c.match_id
      WHERE c.id = p_conversation_id
        AND (ma.user_a = auth.uid() OR ma.user_b = auth.uid())
    )
    AND NOT public.conversation_match_blocked(p_conversation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.patch_activity_proposal_source_message_payload(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patch_activity_proposal_source_message_payload(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.patch_activity_proposal_source_message_payload(uuid, uuid, jsonb) IS
  'Fusionne un patch JSON dans messages.payload pour le message activity_proposal lié à une proposition.';
