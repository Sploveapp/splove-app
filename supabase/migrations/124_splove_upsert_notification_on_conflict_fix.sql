-- Corrige splove_upsert_notification : ON CONFLICT exige l'index UNIQUE partiel
-- idx_in_app_notifications_user_dedupe (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL.
-- Sans cet index (ou sans le prédicat WHERE dans ON CONFLICT) :
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- ---------------------------------------------------------------------------
-- 1. Colonnes requises par 106 (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

-- ---------------------------------------------------------------------------
-- 2. Index UNIQUE partiel — cible exacte du ON CONFLICT ci-dessous
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_in_app_notifications_user_dedupe;

CREATE UNIQUE INDEX idx_in_app_notifications_user_dedupe
  ON public.in_app_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON INDEX public.idx_in_app_notifications_user_dedupe IS
  'Déduplication par utilisateur (likes, matchs, Play, etc.). Requis pour splove_upsert_notification.';

-- ---------------------------------------------------------------------------
-- 3. Fonction — seul objet avec ON CONFLICT sur in_app_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_upsert_notification(
  p_user_id uuid,
  p_kind text,
  p_dedupe_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_exempt_daily_cap boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent int := 0;
  v_kind text := btrim(coalesce(p_kind, ''));
BEGIN
  IF p_user_id IS NULL OR v_kind = '' THEN
    RETURN;
  END IF;

  IF NOT COALESCE(p_exempt_daily_cap, true) THEN
    SELECT COUNT(*)::int INTO v_sent
    FROM public.in_app_notifications n
    WHERE n.user_id = p_user_id
      AND COALESCE(n.exempt_daily_cap, false) = false
      AND (n.created_at AT TIME ZONE 'UTC')::date = (timezone('utc', now()))::date;

    IF v_sent >= 1 THEN
      RETURN;
    END IF;
  END IF;

  IF p_dedupe_key IS NOT NULL AND btrim(p_dedupe_key) <> '' THEN
    INSERT INTO public.in_app_notifications (
      user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key
    )
    VALUES (
      p_user_id,
      v_kind,
      '',
      '',
      false,
      COALESCE(p_exempt_daily_cap, true),
      COALESCE(p_payload, '{}'::jsonb),
      btrim(p_dedupe_key)
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
    DO UPDATE SET
      kind = EXCLUDED.kind,
      payload = EXCLUDED.payload,
      read = false,
      created_at = timezone('utc', now());
    RETURN;
  END IF;

  INSERT INTO public.in_app_notifications (
    user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key
  )
  VALUES (
    p_user_id,
    v_kind,
    '',
    '',
    false,
    COALESCE(p_exempt_daily_cap, true),
    COALESCE(p_payload, '{}'::jsonb),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean) FROM PUBLIC;

COMMENT ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean) IS
  'Insert / upsert notification in-app. ON CONFLICT aligné sur idx_in_app_notifications_user_dedupe (partiel).';
