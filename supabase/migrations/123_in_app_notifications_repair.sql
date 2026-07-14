-- Réparation idempotente — notifications in-app (extrait sûr de 090 + prérequis 106)
-- Exclut volontairement complete_referral (conflit RETURNS void vs jsonb).
-- Après exécution : enchaîner 106 → 107 → 108 → 120 → 121 pour triggers / Play complets.

-- ---------------------------------------------------------------------------
-- 1. Table principale + colonnes 106 (payload, dedupe_key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  exempt_daily_cap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

COMMENT ON COLUMN public.in_app_notifications.kind IS
  'Clé logique pour i18n côté app (ex. invite_link_sent_delay).';

COMMENT ON COLUMN public.in_app_notifications.exempt_daily_cap IS
  'Si true, ne compte pas dans la limite 1 notification calendaire UTC / jour utilisateur (évènements critiques).';

COMMENT ON COLUMN public.in_app_notifications.payload IS
  'Métadonnées deep link : actor_name, conversation_id, route, sport, place, etc.';

COMMENT ON COLUMN public.in_app_notifications.dedupe_key IS
  'Clé idempotente par utilisateur (ex. new_like:<actor_id>:<like_id>).';

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON public.in_app_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_unread
  ON public.in_app_notifications (user_id)
  WHERE read = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_notifications_user_dedupe
  ON public.in_app_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "in_app_notifications_select_own" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_select_own"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "in_app_notifications_update_own" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_update_own"
  ON public.in_app_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.in_app_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Jobs différés (utilisés par pulse_my_in_app_notifications)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.in_app_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  job_type text NOT NULL,
  anchor_at timestamptz NOT NULL,
  run_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_in_app_notification_jobs_due
  ON public.in_app_notification_jobs (user_id, run_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.in_app_notification_jobs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Fonctions 090 (RETURNS void / integer — compatibles CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.in_app_try_insert_notification(
  p_user_id uuid,
  p_kind text,
  p_title text DEFAULT '',
  p_message text DEFAULT '',
  p_exempt_daily_cap boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent int := 0;
BEGIN
  IF p_user_id IS NULL OR btrim(coalesce(p_kind, '')) = '' THEN
    RETURN;
  END IF;

  IF NOT p_exempt_daily_cap THEN
    SELECT COUNT(*)::int INTO v_sent
    FROM public.in_app_notifications n
    WHERE n.user_id = p_user_id
      AND COALESCE(n.exempt_daily_cap, false) = false
      AND (n.created_at AT TIME ZONE 'UTC')::date = (timezone('utc', now()))::date;

    IF v_sent >= 1 THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.in_app_notifications (
    user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key
  )
  VALUES (
    p_user_id,
    p_kind,
    coalesce(trim(p_title), ''),
    coalesce(trim(p_message), ''),
    false,
    p_exempt_daily_cap,
    '{}'::jsonb,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.in_app_try_insert_notification(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.in_app_try_insert_notification(uuid, text, text, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.process_in_app_notification_jobs_for(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_rewarded boolean;
  v_sw int := 0;
BEGIN
  IF p_uid IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT j.id,
           j.user_id,
           j.job_type,
           j.anchor_at,
           j.run_at
      FROM public.in_app_notification_jobs j
     WHERE j.user_id = p_uid
       AND j.processed_at IS NULL
       AND j.run_at <= timezone('utc', now())
     ORDER BY j.run_at ASC
     FOR UPDATE SKIP LOCKED
  LOOP
    IF r.job_type = 'invite_ack_2m' THEN
      PERFORM public.in_app_try_insert_notification(
        r.user_id,
        'invite_link_sent_delay',
        '',
        '',
        false
      );

    ELSIF r.job_type = 'invite_nudge_24h' THEN
      v_rewarded := EXISTS (
        SELECT 1 FROM public.referral_conversions c WHERE c.referrer_id = r.user_id LIMIT 1
      );

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'referrals'
      ) THEN
        v_rewarded := v_rewarded OR EXISTS (
          SELECT 1
            FROM public.referrals rr
           WHERE rr.referrer_id = r.user_id
             AND lower(trim(coalesce(rr.status::text, ''))) LIKE '%reward%'
           LIMIT 1
        );
      END IF;

      IF NOT COALESCE(v_rewarded, false) THEN
        PERFORM public.in_app_try_insert_notification(
          r.user_id,
          'invite_followup_day1',
          '',
          '',
          false
        );
      END IF;

    ELSIF r.job_type = 'discover_engagement_48h' THEN
      IF to_regclass('public.discover_swipe_events') IS NOT NULL THEN
        SELECT COUNT(*)::int INTO v_sw
          FROM public.discover_swipe_events d
         WHERE d.viewer_id = r.user_id
           AND d.created_at >= r.anchor_at;

        IF COALESCE(v_sw, 0) < 1 THEN
          PERFORM public.in_app_try_insert_notification(
            r.user_id,
            'discover_low_engagement_48h',
            '',
            '',
            false
          );
        END IF;
      END IF;
    END IF;

    UPDATE public.in_app_notification_jobs j
       SET processed_at = timezone('utc', now())
     WHERE j.id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.process_in_app_notification_jobs_for(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pulse_my_in_app_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unread int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM public.process_in_app_notification_jobs_for(v_uid);

  SELECT COUNT(*)::int INTO v_unread
    FROM public.in_app_notifications n
   WHERE n.user_id = v_uid
     AND n.read = false;

  RETURN v_unread;
END;
$$;

REVOKE ALL ON FUNCTION public.pulse_my_in_app_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pulse_my_in_app_notifications() TO authenticated;

COMMENT ON FUNCTION public.pulse_my_in_app_notifications() IS
  'Traite les jobs dus pour auth.uid() et renvoie le nombre de notifications non lues.';

-- ---------------------------------------------------------------------------
-- 4. Prérequis 106 — Play / notifications sociales (sans triggers)
-- ---------------------------------------------------------------------------
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
  'Insert / upsert notification in-app (likes, Play, matchs). Requiert payload + dedupe_key (106).';
