-- Source de localisation (manuelle vs appareil) + RPC distances Discover (Haversine côté serveur).
-- Les coordonnées des autres profils ne sont pas exposées au client : le front appelle cette RPC
-- et reçoit uniquement distance_km.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_source TEXT;

COMMENT ON COLUMN public.profiles.location_source IS
  'Origine des coords affichées : manual | device (ou NULL si legacy)';

-- Distance great-circle (km) entre le profil courant (auth.uid()) et chaque candidat.
-- Retourne NULL si viewer ou candidat n''a pas de lat/lng exploitables.
CREATE OR REPLACE FUNCTION public.profile_distances_from_viewer(p_candidate_ids uuid[])
RETURNS TABLE (profile_id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id AS profile_id,
    CASE
      WHEN vm.lat IS NULL
        OR vm.lon IS NULL
        OR c.latitude IS NULL
        OR c.longitude IS NULL
      THEN NULL::double precision
      ELSE (
        6371.0 * acos(
          LEAST(
            1.0::double precision,
            GREATEST(
              -1.0::double precision,
              cos(radians(vm.lat)) * cos(radians(c.latitude))
                * cos(radians(c.longitude) - radians(vm.lon))
                + sin(radians(vm.lat)) * sin(radians(c.latitude))
            )
          )
        )
      )
    END AS distance_km
  FROM public.profiles c
  CROSS JOIN (
    SELECT latitude AS lat, longitude AS lon
    FROM public.profiles
    WHERE id = auth.uid()
  ) vm
  WHERE c.id = ANY(p_candidate_ids);
$$;

COMMENT ON FUNCTION public.profile_distances_from_viewer(uuid[]) IS
  'Distances approximatives (km) pour Discover ; pas d''exposition des coordonnées au client.';

REVOKE ALL ON FUNCTION public.profile_distances_from_viewer(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_distances_from_viewer(uuid[]) TO authenticated;
