-- In-app notifications (pas push). Déclenchées par événements referral + traitement différé via pulse utilisateur.

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_referral_events_user_created ON public.referral_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_name ON public.referral_events (event_name, created_at DESC);

COMMENT ON TABLE public.referral_events IS
  'Événements growth / referral (invite_sent, etc.).';

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_events_insert_own" ON public.referral_events;
CREATE POLICY "referral_events_insert_own"
  ON public.referral_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NOT DISTINCT FROM auth.uid());

DROP POLICY IF EXISTS "referral_events_select_own" ON public.referral_events;
CREATE POLICY "referral_events_select_own"
  ON public.referral_events
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT DISTINCT FROM auth.uid());

GRANT SELECT, INSERT ON public.referral_events TO authenticated;

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

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created ON public.in_app_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_unread ON public.in_app_notifications (user_id)
  WHERE read = false;

COMMENT ON COLUMN public.in_app_notifications.kind IS
  'Clé logique pour i18n côté app (ex. invite_link_sent_delay).';

COMMENT ON COLUMN public.in_app_notifications.exempt_daily_cap IS
  'Si true, ne compte pas dans la limite 1 notification calendaire UTC / jour utilisateur (évènements critiques).';

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
-- Jobs traités uniquement via fonctions SECURITY DEFINER ; pas de policy client.

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

  INSERT INTO public.in_app_notifications (user_id, kind, title, message, read, exempt_daily_cap)
  VALUES (
    p_user_id,
    p_kind,
    coalesce(trim(p_title), ''),
    coalesce(trim(p_message), ''),
    false,
    p_exempt_daily_cap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.in_app_try_insert_notification(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.in_app_try_insert_notification(uuid, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
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

    UPDATE public.in_app_notification_jobs j
       SET processed_at = timezone('utc', now())
     WHERE j.id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.process_in_app_notification_jobs_for(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
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
CREATE OR REPLACE FUNCTION public.tr_schedule_in_app_notifications_on_invite_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_name IS DISTINCT FROM 'invite_sent' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.in_app_notification_jobs (user_id, job_type, anchor_at, run_at)
  VALUES
    (NEW.user_id, 'invite_ack_2m', NEW.created_at, NEW.created_at + interval '2 minutes'),
    (NEW.user_id, 'invite_nudge_24h', NEW.created_at, NEW.created_at + interval '24 hours'),
    (NEW.user_id, 'discover_engagement_48h', NEW.created_at, NEW.created_at + interval '48 hours');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_referral_events_invite_notifications ON public.referral_events;
CREATE TRIGGER tr_referral_events_invite_notifications
  AFTER INSERT ON public.referral_events
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_schedule_in_app_notifications_on_invite_sent();

-- ---------------------------------------------------------------------------
-- complete_referral : notifier le parrain (hors plafond journalier)
CREATE OR REPLACE FUNCTION public.complete_referral(p_user_id uuid, p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code text;
  v_referrer_id uuid;
  v_conv_id uuid;
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF v_actor <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_code := upper(btrim(COALESCE(p_referral_code, '')));
  IF v_code = '' OR length(v_code) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT p.id
    INTO v_referrer_id
    FROM public.profiles p
   WHERE upper(p.referral_code) = v_code
   LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_referrer_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referral_conversions (referrer_id, referee_id, referral_code)
  VALUES (v_referrer_id, p_user_id, v_code)
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  UPDATE public.profiles
     SET referred_by_user_id = v_referrer_id,
         rewind_credits = COALESCE(rewind_credits, 0) + 1,
         referral_plus_until = GREATEST(
           COALESCE(referral_plus_until, to_timestamp(0) AT TIME ZONE 'UTC'),
           timezone('utc', now()) + interval '3 days'
         )
   WHERE id = p_user_id
     AND referred_by_user_id IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    DELETE FROM public.referral_conversions WHERE id = v_conv_id;
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  UPDATE public.profiles
     SET boost_credits = COALESCE(boost_credits, 0) + 3,
         undo_swipe_credits = COALESCE(undo_swipe_credits, 0) + 3,
         second_chance_credits = COALESCE(second_chance_credits, 0) + 2,
         beta_splove_plus_unlocked = true
   WHERE id = v_referrer_id;

  PERFORM public.in_app_try_insert_notification(
    v_referrer_id,
    'referrer_zone_unlocked',
    '',
    '',
    true
  );

  RETURN jsonb_build_object(
    'ok',
    true,
    'referrer_id',
    v_referrer_id,
    'referee_id',
    p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_referral(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_referral(uuid, text) TO authenticated;
