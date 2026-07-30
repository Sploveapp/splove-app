-- Corrige splove_upsert_notification :
-- - ne plus réinitialiser read / created_at en cas de conflit (badge bloqué, dates « dans X sec »)
-- - horodatage d’insertion optionnel (backfill client depuis l’événement source)
-- - RPC client sécurisée (auth.uid = destinataire) + fonction interne pour triggers / RPC métier
-- - GRANT EXECUTE à authenticated pour syncBellNotifications

CREATE OR REPLACE FUNCTION public.splove_upsert_notification_internal(
  p_user_id uuid,
  p_kind text,
  p_dedupe_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_exempt_daily_cap boolean DEFAULT true,
  p_event_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent int := 0;
  v_kind text := btrim(coalesce(p_kind, ''));
  v_event_at timestamptz := COALESCE(p_event_at, timezone('utc', now()));
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
      user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key, created_at
    )
    VALUES (
      p_user_id,
      v_kind,
      '',
      '',
      false,
      COALESCE(p_exempt_daily_cap, true),
      COALESCE(p_payload, '{}'::jsonb),
      btrim(p_dedupe_key),
      v_event_at
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
    DO UPDATE SET
      kind = EXCLUDED.kind,
      payload = in_app_notifications.payload || EXCLUDED.payload,
      read = in_app_notifications.read,
      created_at = in_app_notifications.created_at;
    RETURN;
  END IF;

  INSERT INTO public.in_app_notifications (
    user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key, created_at
  )
  VALUES (
    p_user_id,
    v_kind,
    '',
    '',
    false,
    COALESCE(p_exempt_daily_cap, true),
    COALESCE(p_payload, '{}'::jsonb),
    NULL,
    v_event_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.splove_upsert_notification_internal(uuid, text, text, jsonb, boolean, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.splove_upsert_notification(
  p_user_id uuid,
  p_kind text,
  p_dedupe_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_exempt_daily_cap boolean DEFAULT true,
  p_event_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync client : auth.uid() = destinataire.
  -- Triggers : pg_trigger_depth() > 0.
  -- RPC create_like (Play) : auth.uid() = payload.actor_id, destinataire = p_user_id.
  IF pg_trigger_depth() = 0
     AND auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid() THEN
    IF coalesce(p_payload->>'actor_id', '') IS DISTINCT FROM auth.uid()::text THEN
      RETURN;
    END IF;
  END IF;

  PERFORM public.splove_upsert_notification_internal(
    p_user_id, p_kind, p_dedupe_key, p_payload, p_exempt_daily_cap, p_event_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean, timestamptz) TO authenticated;

-- Triggers & RPC métier (create_like Play, etc.) : fonction interne sans garde auth.uid.
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_reciprocal boolean := false;
  v_actor jsonb;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'from_user'
    ) THEN
      v_from := NEW.from_user;
      v_to := NEW.to_user;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.from_user = v_to AND l.to_user = v_from
      ) INTO v_reciprocal;
    ELSE
      v_from := NEW.liker_id;
      v_to := NEW.liked_id;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.liker_id = v_to AND l.liked_id = v_from
      ) INTO v_reciprocal;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_to IS NULL OR v_from IS NULL OR v_reciprocal THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'play_type'
  ) AND NEW.play_type IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_actor := public.splove_notification_actor_payload(v_from);

  PERFORM public.splove_upsert_notification_internal(
    v_to,
    'new_like',
    'new_like:' || v_from::text || ':' || NEW.id::text,
    v_actor || jsonb_build_object('route', '/likes-you'),
    true,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.splove_upsert_notification(uuid, text, text, jsonb, boolean, timestamptz) IS
  'RPC client : upsert notification in-app pour auth.uid(). Conflit : conserve read et created_at.';

COMMENT ON FUNCTION public.splove_upsert_notification_internal(uuid, text, text, jsonb, boolean, timestamptz) IS
  'Upsert interne (triggers, create_like). Conflit : conserve read et created_at ; fusionne payload.';
