-- =============================================
-- SPLove — FK modération → auth.users, filtre Discover photo1, RLS grants
-- =============================================

-- --- FK vers auth.users (aligné spec produit) ---
ALTER TABLE public.photo_moderation_results DROP CONSTRAINT IF EXISTS photo_moderation_results_user_id_fkey;
ALTER TABLE public.photo_moderation_results
  ADD CONSTRAINT photo_moderation_results_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.photo_moderation_results DROP CONSTRAINT IF EXISTS photo_moderation_results_reviewed_by_fkey;
ALTER TABLE public.photo_moderation_results
  ADD CONSTRAINT photo_moderation_results_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.photo_reports DROP CONSTRAINT IF EXISTS photo_reports_reported_user_id_fkey;
ALTER TABLE public.photo_reports DROP CONSTRAINT IF EXISTS photo_reports_reporter_user_id_fkey;

ALTER TABLE public.photo_reports
  ADD CONSTRAINT photo_reports_reported_user_id_fkey
  FOREIGN KEY (reported_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.photo_reports
  ADD CONSTRAINT photo_reports_reporter_user_id_fkey
  FOREIGN KEY (reporter_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- --- Discover : visibles si photo principale approuvée (photo2 géré en bêta côté app) ---
CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND COALESCE(p.photo1_status, 'pending') = 'approved';

COMMENT ON VIEW public.feed_profiles IS
  'Profils Discover : compte auth actif + photo slot 1 (portrait) approuvée. En bêta, l’app filtre aussi photo2_status = approved.';

GRANT SELECT ON public.feed_profiles TO authenticated;

-- --- Pas de lecture anonyme sur les tables modération ---
REVOKE ALL ON public.photo_moderation_results FROM PUBLIC;
REVOKE ALL ON public.photo_moderation_results FROM anon;
REVOKE ALL ON public.photo_reports FROM PUBLIC;
REVOKE ALL ON public.photo_reports FROM anon;

GRANT SELECT, UPDATE ON public.photo_moderation_results TO authenticated;
GRANT INSERT ON public.photo_reports TO authenticated;
