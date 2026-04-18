-- Fix: migration 060 enveloppe `feed_profiles` avec pg_get_viewdef → liste de colonnes
-- figée à l’époque, sans les colonnes ajoutées ensuite sur `public.profiles`
-- (ex. `photo2_status` en 058). PostgREST ne peut alors pas
-- filtrer `.eq('photo2_status', ...)` sur la vue.
--
-- Recréer la vue avec `SELECT p.*` pour suivre `profiles` à jour, même logique métier que 059.

CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND COALESCE(p.photo1_status, 'pending') = 'approved';

COMMENT ON VIEW public.feed_profiles IS
  'Profils Discover : compte auth actif + photo slot 1 (portrait) approuvée. Expose profiles.*.';

GRANT SELECT ON public.feed_profiles TO authenticated;
