-- Discover : signaux légers pour tri qualité (sans UI).
-- - last_active_at : rafraîchi par RPC côté app
-- - activity_proposals_count : dénormalisé (trigger sur activity_proposals)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS activity_proposals_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_active_at IS 'Dernière activité app (touch_profile_last_active)';
COMMENT ON COLUMN public.profiles.activity_proposals_count IS 'Nombre de propositions d’activité envoyées (dénormalisé)';

UPDATE public.profiles
SET last_active_at = created_at
WHERE last_active_at IS NULL;

UPDATE public.profiles p
SET activity_proposals_count = COALESCE(sub.c, 0)
FROM (
  SELECT proposed_by AS pid, COUNT(*)::integer AS c
  FROM public.activity_proposals
  GROUP BY proposed_by
) sub
WHERE p.id = sub.pid;

CREATE OR REPLACE FUNCTION public.bump_profile_activity_proposals_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET activity_proposals_count = activity_proposals_count + 1
  WHERE id = NEW.proposed_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_proposals_bump_count ON public.activity_proposals;
CREATE TRIGGER trg_activity_proposals_bump_count
  AFTER INSERT ON public.activity_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_profile_activity_proposals_count();

COMMENT ON FUNCTION public.bump_profile_activity_proposals_count() IS
  'Incrémente activity_proposals_count pour proposed_by';

CREATE OR REPLACE FUNCTION public.touch_profile_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = NOW()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_profile_last_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_profile_last_active() TO authenticated;

COMMENT ON FUNCTION public.touch_profile_last_active() IS
  'Met à jour last_active_at pour l’utilisateur courant (Discover / session)';
