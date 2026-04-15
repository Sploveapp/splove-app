-- Lecture des messages : read_at + RPC pour marquer comme lus les messages reçus (badge inbox).

DO $$
BEGIN
  IF to_regclass('public.messages') IS NULL THEN
    RAISE NOTICE '054: public.messages missing — skipped.';
  ELSE
    ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

    COMMENT ON COLUMN public.messages.read_at IS
      'Recipient read time (1:1). NULL means unread for the recipient.';

    -- Backfill: avoid flooding the inbox badge on deploy (no reliable unread state before this column).
    UPDATE public.messages
    SET read_at = created_at
    WHERE read_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_conv_unread
      ON public.messages (conversation_id)
      WHERE read_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages m
  SET read_at = now()
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id IS DISTINCT FROM auth.uid()
    AND m.read_at IS NULL
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

REVOKE ALL ON FUNCTION public.mark_conversation_messages_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_conversation_messages_read(uuid) IS
  'Marque comme lus les messages reçus dans la conversation (read_at) pour l’utilisateur courant.';
