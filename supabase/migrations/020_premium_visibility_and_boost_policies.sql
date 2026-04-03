-- SPLove+ visibility for Discover ranking/badges and boost activation.

-- Allow authenticated users to see active premium flags (for badge/priority UX).
DROP POLICY IF EXISTS "subscriptions_select_active_public" ON public.subscriptions;
CREATE POLICY "subscriptions_select_active_public"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' AND (ends_at IS NULL OR ends_at > NOW())
  );

-- Allow authenticated users to see active boosts (for Discover ordering/badge).
DROP POLICY IF EXISTS "profile_boosts_select_active_public" ON public.profile_boosts;
CREATE POLICY "profile_boosts_select_active_public"
  ON public.profile_boosts
  FOR SELECT
  TO authenticated
  USING (ends_at > NOW());

-- Allow users to create their own boost rows.
DROP POLICY IF EXISTS "profile_boosts_insert_own" ON public.profile_boosts;
CREATE POLICY "profile_boosts_insert_own"
  ON public.profile_boosts
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());
