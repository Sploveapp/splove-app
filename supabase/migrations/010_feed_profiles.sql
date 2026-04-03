-- Discover : uniquement les profils dont l’id existe encore dans auth.users
-- (évite les erreurs FK du type likes_to_user_fkey sur des comptes fantôles)

CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

COMMENT ON VIEW public.feed_profiles IS
  'Sous-ensemble de profiles likables — id présent dans auth.users';

GRANT SELECT ON public.feed_profiles TO authenticated;
