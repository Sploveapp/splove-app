-- Répondant (non-proposeur) : UPDATE accepté/refusé bloqué par RLS.
-- Cause : l’ancienne clause EXISTS utilisait une OR avec m.conversation_id sur public.matches
-- (colonne absente du schéma SPLove documenté en 025), et la priorité AND/OR permettait
-- de valider l’existence du match sans exiger que auth.uid() soit user_a/user_b.
--
-- Correction minimale : une seule condition — l’utilisateur doit être participant du match
-- référencé par activity_proposals.match_id (aligné avec conversations.match_id).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposed_by'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        (status = 'proposed' OR status IS NULL)
        AND auth.uid() IS DISTINCT FROM proposed_by
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE m.id = activity_proposals.match_id
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      )
      WITH CHECK (
        status IN ('accepted', 'alternative_requested', 'declined')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE m.id = activity_proposals.match_id
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      );

  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposer_id'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        (status = 'proposed' OR status IS NULL)
        AND auth.uid() IS DISTINCT FROM proposer_id
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE m.id = activity_proposals.match_id
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      )
      WITH CHECK (
        status IN ('accepted', 'alternative_requested', 'declined')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE m.id = activity_proposals.match_id
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      );

  ELSE
    RAISE NOTICE '049_activity_proposals_update_rls_responder: colonne proposeur introuvable, policy non modifiée.';
  END IF;
END $$;
