-- Lieux enregistrés par profil (référence opaque — pas de nom exposé côté Discover).
-- Sert au teaser « lieu commun » dans Discover via RPC booléenne uniquement.

CREATE TABLE IF NOT EXISTS public.profile_saved_places (
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  place_ref uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, place_ref)
);

CREATE INDEX IF NOT EXISTS idx_profile_saved_places_place_ref ON public.profile_saved_places (place_ref);

COMMENT ON TABLE public.profile_saved_places IS
  'Lieux associés au profil ; place_ref = identifiant stable (catalogue / provider), sans libellé obligatoire côté mobile.';

ALTER TABLE public.profile_saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_saved_places_select_own" ON public.profile_saved_places;
CREATE POLICY "profile_saved_places_select_own"
  ON public.profile_saved_places FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_saved_places_insert_own" ON public.profile_saved_places;
CREATE POLICY "profile_saved_places_insert_own"
  ON public.profile_saved_places FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_saved_places_delete_own" ON public.profile_saved_places;
CREATE POLICY "profile_saved_places_delete_own"
  ON public.profile_saved_places FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- Détecte l’intersection place_ref entre le viewer et chaque candidat ; sortie booléenne uniquement (pas de noms).
CREATE OR REPLACE FUNCTION public.discover_shared_place_flags(
  p_viewer_id uuid,
  p_candidate_ids uuid[]
)
RETURNS TABLE (profile_id uuid, has_shared_place boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS profile_id,
    EXISTS (
      SELECT 1
      FROM public.profile_saved_places v
      INNER JOIN public.profile_saved_places o ON v.place_ref = o.place_ref
      WHERE v.profile_id = p_viewer_id
        AND o.profile_id = c.id
    ) AS has_shared_place
  FROM (SELECT DISTINCT unnest(p_candidate_ids) AS id) AS c
  WHERE auth.uid() IS NOT NULL
    AND auth.uid() = p_viewer_id;
$$;

COMMENT ON FUNCTION public.discover_shared_place_flags(uuid, uuid[]) IS
  'Discover : indique si le viewer partage au moins un place_ref avec chaque candidat ; pas de fuite de libellés.';

REVOKE ALL ON FUNCTION public.discover_shared_place_flags(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_shared_place_flags(uuid, uuid[]) TO authenticated;
