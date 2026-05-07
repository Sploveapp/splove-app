-- Discover V3: read active boost_visibility / priority_meet for candidates (bypasses per-user RLS on feature_activations).

CREATE OR REPLACE FUNCTION public.discover_candidate_splove_ranking_flags(p_candidate_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  boost_active boolean,
  priority_meet_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    x.candidate_id AS profile_id,
    EXISTS (
      SELECT 1
      FROM public.feature_activations fa
      WHERE fa.user_id = x.candidate_id
        AND fa.feature_type = 'boost_visibility'
        AND fa.expires_at > now()
    ) AS boost_active,
    EXISTS (
      SELECT 1
      FROM public.feature_activations fa
      WHERE fa.user_id = x.candidate_id
        AND fa.feature_type = 'priority_meet'
        AND fa.expires_at > now()
    ) AS priority_meet_active
  FROM unnest(coalesce(p_candidate_ids, '{}'::uuid[])) AS x(candidate_id);
$$;

COMMENT ON FUNCTION public.discover_candidate_splove_ranking_flags(uuid[]) IS
  'Returns SPLove+ timed flags per candidate profile for Discover ranking (server-side visibility).';

REVOKE ALL ON FUNCTION public.discover_candidate_splove_ranking_flags(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_candidate_splove_ranking_flags(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_candidate_splove_ranking_flags(uuid[]) TO service_role;
