-- =============================================
-- SPLove — Matches RLS minimal unblock
-- =============================================

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Prevent self-match rows.
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_no_self;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_no_self CHECK (user_a IS DISTINCT FROM user_b);

-- Avoid duplicate pairs (app sorts IDs before insert).
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_user_pair_unique;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_user_pair_unique UNIQUE (user_a, user_b);

DROP POLICY IF EXISTS "matches_select_participant" ON public.matches;
CREATE POLICY "matches_select_participant"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "matches_insert_participant" ON public.matches;
CREATE POLICY "matches_insert_participant"
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
