-- Les deux membres d’un match doivent pouvoir lire (et upserter côté app) leur ligne `conversations`.

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_match_participants" ON public.conversations;
CREATE POLICY "conversations_select_match_participants"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversations_insert_match_participants" ON public.conversations;
CREATE POLICY "conversations_insert_match_participants"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversations_update_match_participants" ON public.conversations;
CREATE POLICY "conversations_update_match_participants"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );
