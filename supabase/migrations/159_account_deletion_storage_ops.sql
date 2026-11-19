-- Ops reprise Storage (hors P0 / 157).
-- N’active AUCUN cron. La purge des preuves n’est PAS planifiée ici.

CREATE TABLE IF NOT EXISTS public.account_deletion_ops_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('storage_repeated_failure', 'storage_stuck')),
  user_key text NOT NULL
    CHECK (char_length(user_key) = 8 AND user_key !~* '[@/:]'),
  attempts integer NOT NULL CHECK (attempts >= 0),
  error_code text NOT NULL DEFAULT 'storage_failed',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_deletion_ops_events IS
  'Alertes reprise photos. user_key = 8 premiers caractères d’UUID. Pas d’e-mail, pas de secret.';

CREATE INDEX IF NOT EXISTS account_deletion_ops_events_created_at_idx
  ON public.account_deletion_ops_events (created_at DESC);

ALTER TABLE public.account_deletion_ops_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_ops_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.account_deletion_ops_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_account_deletion_ops_event(
  p_kind text,
  p_user_key text,
  p_attempts integer,
  p_error_code text DEFAULT 'storage_failed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF p_kind IS DISTINCT FROM 'storage_repeated_failure'
     AND p_kind IS DISTINCT FROM 'storage_stuck' THEN
    RAISE EXCEPTION 'invalid_ops_event_kind' USING ERRCODE = '22023';
  END IF;
  IF p_user_key IS NULL OR char_length(p_user_key) <> 8 OR p_user_key ~* '[@/:]' THEN
    RAISE EXCEPTION 'invalid_ops_user_key' USING ERRCODE = '22023';
  END IF;
  v_code := left(btrim(coalesce(p_error_code, 'storage_failed')), 300);
  INSERT INTO public.account_deletion_ops_events (kind, user_key, attempts, error_code)
  VALUES (p_kind, p_user_key, GREATEST(coalesce(p_attempts, 0), 0), v_code)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_deletion_ops_event(text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_deletion_ops_event(text, text, integer, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_account_deletion_storage_stuck(p_now timestamptz DEFAULT NULL)
RETURNS TABLE(
  user_key text,
  status text,
  storage_attempts integer,
  next_retry_at timestamptz,
  last_error text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT left(r.user_id::text, 8) AS user_key,
         r.status,
         r.storage_attempts,
         r.next_retry_at,
         r.last_error
  FROM public.account_deletion_requests AS r
  WHERE r.status IN ('db_deleted', 'storage_pending')
    AND r.storage_attempts >= 5
    AND (r.next_retry_at IS NULL OR r.next_retry_at <= coalesce(p_now, pg_catalog.now()));
$$;

REVOKE ALL ON FUNCTION public.list_account_deletion_storage_stuck(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_storage_stuck(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.list_account_deletion_storage_stuck(timestamptz) IS
  'Comptes photos bloqués (clé 8 car.). service_role. Pas d’e-mail.';

-- Refuse d’activer un cron sauf drapeau explicite d’environnement isolé.
CREATE OR REPLACE FUNCTION public.enable_account_deletion_storage_purge_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'storage_purge_cron_disabled'
    USING ERRCODE = 'P0001',
          HINT = 'Pas de cron automatique. Inventaire local : scripts/account-deletion-storage-purge-local.mjs. Reprise : scripts/account-deletion-storage-purge-worker.ts vers purge-deleted-account-storage. Production : autorisation séparée.';
END;
$$;

REVOKE ALL ON FUNCTION public.enable_account_deletion_storage_purge_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enable_account_deletion_storage_purge_cron() TO service_role;

COMMENT ON FUNCTION public.enable_account_deletion_storage_purge_cron() IS
  'Toujours en échec volontaire : aucun pg_cron n’est créé par cette migration.';
