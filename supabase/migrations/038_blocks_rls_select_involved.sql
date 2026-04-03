-- Chaque utilisateur peut lire les lignes de blocage où il est concerné (bloqueur ou bloqué).
-- Nécessaire pour les SELECT directs ; les RPC SECURITY DEFINER fonctionnent déjà côté app.

DROP POLICY IF EXISTS "blocks_select_own_as_blocker" ON public.blocks;

CREATE POLICY "blocks_select_if_involved"
  ON public.blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());
