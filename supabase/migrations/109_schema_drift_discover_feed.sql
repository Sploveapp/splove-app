-- Drift frontend ↔ Supabase : Discover feed RPC, photo activité, alias feed_profiles_ranked.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activity_photo_path text;

COMMENT ON COLUMN public.profiles.activity_photo_path IS
  'Chemin storage photo activité (onboarding étape corps/activité).';

CREATE OR REPLACE VIEW public.feed_profiles_ranked
WITH (security_invoker = true) AS
SELECT p.*
FROM public.feed_profiles p;

COMMENT ON VIEW public.feed_profiles_ranked IS
  'Alias Discover pour sondes navigation (même logique que feed_profiles).';

GRANT SELECT ON public.feed_profiles_ranked TO authenticated;

CREATE OR REPLACE FUNCTION public.get_discover_feed_alive(p_limit integer DEFAULT 12)
RETURNS TABLE (
  profile jsonb,
  activity_label text,
  availability_label text,
  vibe_label text,
  feed_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_jsonb(p.*) AS profile,
    NULL::text AS activity_label,
    NULL::text AS availability_label,
    NULL::text AS vibe_label,
    'alive_feed'::text AS feed_reason
  FROM public.feed_profiles p
  WHERE p.id IS DISTINCT FROM auth.uid()
    AND COALESCE(p.profile_completed, false) = true
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.discover_swipe_events d
      WHERE d.viewer_id = auth.uid()
        AND d.target_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.likes l
      WHERE l.liker_id = auth.uid()
        AND l.liked_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE (m.user_a = auth.uid() AND m.user_b = p.id)
         OR (m.user_a = p.id AND m.user_b = auth.uid())
    )
  ORDER BY p.last_active_at DESC NULLS LAST, p.updated_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 50));
$$;

COMMENT ON FUNCTION public.get_discover_feed_alive(integer) IS
  'Feed Discover : profils feed_profiles vivants, hors swipes/likes/blocs/matchs du viewer.';

REVOKE ALL ON FUNCTION public.get_discover_feed_alive(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discover_feed_alive(integer) TO authenticated;
