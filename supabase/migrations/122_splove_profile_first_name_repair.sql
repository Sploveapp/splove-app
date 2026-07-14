-- Réparation : splove_profile_first_name(uuid) requis par create_like_and_get_result (Play)
-- et les triggers notifications (106, 113, 120, 121).
-- Idempotent — recrée la fonction si absente ou driftée.

CREATE OR REPLACE FUNCTION public.splove_profile_first_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(TRIM(p.first_name), ''), 'Quelqu''un')
  FROM public.profiles p
  WHERE p.id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.splove_profile_first_name(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.splove_profile_first_name(uuid) IS
  'Prénom profil pour notifications (likes, Play, matchs). Fallback « Quelqu''un ».';
