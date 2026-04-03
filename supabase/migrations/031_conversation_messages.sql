-- Messages texte post-match (complément des activity_proposals).
-- Utilisé pour le flux « amical » : discussion libre sans imposer une proposition d’activité.

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_messages_body_nonempty CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_created
  ON public.conversation_messages (conversation_id, created_at ASC);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_messages_select_participants" ON public.conversation_messages;
CREATE POLICY "conversation_messages_select_participants"
  ON public.conversation_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_messages.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversation_messages_insert_participant" ON public.conversation_messages;
CREATE POLICY "conversation_messages_insert_participant"
  ON public.conversation_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_messages.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.conversation_messages TO authenticated;

COMMENT ON TABLE public.conversation_messages IS
  'Messages texte dans une conversation de match (MVP — flux amical).';
