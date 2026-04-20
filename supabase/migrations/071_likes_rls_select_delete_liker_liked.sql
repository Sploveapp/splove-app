-- Align likes RLS with liker_id/liked_id (RPC create_like_and_get_result, Discover).
-- Migration 003 only defined SELECT/DELETE on from_user/to_user; DBs with liker_id/liked_id
-- need policies on those columns or received likes are invisible (empty « Qui m’a liké »).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'liker_id'
  ) THEN
    DROP POLICY IF EXISTS "likes_select_own_or_received" ON public.likes;
    CREATE POLICY "likes_select_own_or_received"
      ON public.likes FOR SELECT
      TO authenticated
      USING (liker_id = auth.uid() OR liked_id = auth.uid());

    DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
    CREATE POLICY "likes_delete_own"
      ON public.likes FOR DELETE
      TO authenticated
      USING (liker_id = auth.uid());
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'from_user'
  ) THEN
    DROP POLICY IF EXISTS "likes_select_own_or_received" ON public.likes;
    CREATE POLICY "likes_select_own_or_received"
      ON public.likes FOR SELECT
      TO authenticated
      USING (from_user = auth.uid() OR to_user = auth.uid());

    DROP POLICY IF EXISTS "likes_delete_own" ON public.likes;
    CREATE POLICY "likes_delete_own"
      ON public.likes FOR DELETE
      TO authenticated
      USING (from_user = auth.uid());
  END IF;
END $$;
