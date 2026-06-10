-- Séparation DEV / STAGING / PRODUCTION pour les push natifs + journal d'audit.

-- ---------------------------------------------------------------------------
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS push_environment text;

UPDATE public.device_tokens
SET push_environment = 'production'
WHERE push_environment IS NULL OR btrim(push_environment) = '';

ALTER TABLE public.device_tokens
  ALTER COLUMN push_environment SET DEFAULT 'production',
  ALTER COLUMN push_environment SET NOT NULL;

ALTER TABLE public.device_tokens
  DROP CONSTRAINT IF EXISTS device_tokens_push_environment_check;

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_push_environment_check
  CHECK (push_environment IN ('development', 'staging', 'production'));

COMMENT ON COLUMN public.device_tokens.push_environment IS
  'Environnement du build (development | staging | production). Doit correspondre à SPLove_PUSH_ENV sur l''Edge Function.';

ALTER TABLE public.device_tokens
  DROP CONSTRAINT IF EXISTS device_tokens_user_platform_unique;

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_user_platform_env_unique
  UNIQUE (user_id, platform, push_environment);

-- ---------------------------------------------------------------------------
ALTER TABLE public.push_webhook_settings
  ADD COLUMN IF NOT EXISTS push_environment text;

UPDATE public.push_webhook_settings
SET push_environment = 'production'
WHERE push_environment IS NULL OR btrim(push_environment) = '';

ALTER TABLE public.push_webhook_settings
  ALTER COLUMN push_environment SET DEFAULT 'production',
  ALTER COLUMN push_environment SET NOT NULL;

ALTER TABLE public.push_webhook_settings
  DROP CONSTRAINT IF EXISTS push_webhook_settings_push_environment_check;

ALTER TABLE public.push_webhook_settings
  ADD CONSTRAINT push_webhook_settings_push_environment_check
  CHECK (push_environment IN ('development', 'staging', 'production'));

COMMENT ON COLUMN public.push_webhook_settings.push_environment IS
  'Environnement push de ce projet Supabase. Doit être identique au secret Edge SPLove_PUSH_ENV.';

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_send_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  push_environment text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'edge_function',
  kind text,
  title text,
  body text,
  route text,
  recipient_user_id uuid,
  recipient_count int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  admin_user_id uuid,
  payload jsonb,
  errors jsonb
);

COMMENT ON TABLE public.push_send_audit_log IS
  'Journal serveur de chaque tentative d''envoi push (contenu, destinataires, admin, horodatage).';

CREATE INDEX IF NOT EXISTS idx_push_send_audit_log_created_at
  ON public.push_send_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_send_audit_log_recipient
  ON public.push_send_audit_log (recipient_user_id, created_at DESC);

ALTER TABLE public.push_send_audit_log ENABLE ROW LEVEL SECURITY;

-- Aucune policy client : lecture réservée service_role / staff SQL.

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_dispatch_push_notification(
  p_recipient_user_id uuid,
  p_kind text,
  p_route text,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text;
  v_secret text;
  v_push_env text;
  v_body jsonb;
BEGIN
  IF p_recipient_user_id IS NULL OR btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_route, '')) = '' THEN
    RETURN;
  END IF;

  SELECT s.functions_base_url, s.webhook_secret, s.push_environment
  INTO v_base_url, v_secret, v_push_env
  FROM public.push_webhook_settings s
  WHERE s.id = 1;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
    RETURN;
  END IF;

  IF v_push_env IS NULL OR btrim(v_push_env) = '' THEN
    v_push_env := 'production';
  END IF;

  v_body := jsonb_build_object(
    'recipientUserId', p_recipient_user_id,
    'kind', btrim(p_kind),
    'route', btrim(p_route),
    'conversationId', p_conversation_id,
    'pushEnvironment', v_push_env,
    'triggerSource', 'sql_trigger'
  );

  PERFORM net.http_post(
    url := rtrim(v_base_url, '/') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Splove-Push-Secret', v_secret
    ),
    body := v_body
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[splove_dispatch_push_notification] kind=% recipient=% err=%',
      p_kind, p_recipient_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.splove_dispatch_push_notification(uuid, text, text, uuid) FROM PUBLIC;
