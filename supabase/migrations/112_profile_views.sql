-- Vues Move sans décision (like/pass) — ordonnancement du feed côté client.

CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  viewed_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  action_taken boolean NOT NULL DEFAULT false,
  CONSTRAINT profile_views_viewer_viewed_unique UNIQUE (viewer_id, viewed_profile_id),
  CONSTRAINT profile_views_no_self_view CHECK (viewer_id <> viewed_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_id
  ON public.profile_views (viewer_id);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_viewed_at
  ON public.profile_views (viewer_id, viewed_at DESC);

COMMENT ON TABLE public.profile_views IS
  'Profils affichés sur Move : viewed_at + action_taken=false tant qu’aucun like/pass explicite.';

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_views_select_own" ON public.profile_views;
CREATE POLICY "profile_views_select_own"
  ON public.profile_views
  FOR SELECT
  TO authenticated
  USING (viewer_id = auth.uid());

DROP POLICY IF EXISTS "profile_views_insert_own" ON public.profile_views;
CREATE POLICY "profile_views_insert_own"
  ON public.profile_views
  FOR INSERT
  TO authenticated
  WITH CHECK (viewer_id = auth.uid());

DROP POLICY IF EXISTS "profile_views_update_own" ON public.profile_views;
CREATE POLICY "profile_views_update_own"
  ON public.profile_views
  FOR UPDATE
  TO authenticated
  USING (viewer_id = auth.uid())
  WITH CHECK (viewer_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.profile_views TO authenticated;
