-- Pass explicites + dernier undo (pile par viewer) pour Discover SPLove+.

CREATE TABLE IF NOT EXISTS public.profile_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  passed_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_passes_viewer_created
  ON public.profile_passes (viewer_id, created_at DESC);

ALTER TABLE public.profile_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_passes_select_own" ON public.profile_passes;
CREATE POLICY "profile_passes_select_own"
  ON public.profile_passes FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

COMMENT ON TABLE public.profile_passes IS
  'Pile locale des passes Discover — utilisée pour undo_last_pass ; les likes ne passent pas ici.';

CREATE OR REPLACE FUNCTION public.pass_profile(p_passed_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;
  IF p_passed_profile_id IS NULL OR p_passed_profile_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  INSERT INTO public.profile_passes (viewer_id, passed_profile_id)
  VALUES (v_uid, p_passed_profile_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pass_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pass_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_last_pass()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rid uuid;
  e uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth', 'restored_profile_id', NULL);
  END IF;

  DELETE FROM public.profile_passes
  WHERE id = (
      SELECT pp.id
      FROM public.profile_passes pp
      WHERE pp.viewer_id = v_uid
      ORDER BY pp.created_at DESC
      LIMIT 1
    )
  RETURNING passed_profile_id INTO v_rid;

  IF v_rid IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'restored_profile_id', NULL);
  END IF;

  SELECT ev.id INTO e
  FROM public.discover_swipe_events ev
  WHERE ev.viewer_id = v_uid
    AND ev.target_id = v_rid
    AND ev.action = 'pass'
  ORDER BY ev.created_at DESC
  LIMIT 1;

  IF e IS NOT NULL THEN
    DELETE FROM public.discover_swipe_events WHERE id = e;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'restored_profile_id', v_rid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_last_pass() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_last_pass() TO authenticated;
