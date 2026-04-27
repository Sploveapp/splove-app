-- Discover: swipe log, rewind (rules serveur), mémoire « profils croisés ».
-- N’alère pas le flux like/match existant (create_like_and_get_result).

-- ---------------------------------------------------------------------------
-- 1) Accès Splove+ (abonnement + parrainage migration 076)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discover_user_has_splove_plus(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub boolean;
  v_ref timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = p_uid
      AND s.status = 'active'
      AND (s.ends_at IS NULL OR s.ends_at > now())
  ) INTO v_sub;

  IF v_sub THEN
    RETURN true;
  END IF;

  SELECT p.referral_plus_until INTO v_ref
  FROM public.profiles p
  WHERE p.id = p_uid;

  IF v_ref IS NOT NULL AND v_ref > now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.discover_user_has_splove_plus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_user_has_splove_plus(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Journal de swipes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discover_swipe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('like', 'pass')),
  decision_time_ms integer NOT NULL DEFAULT 0,
  is_match boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discover_swipe_events_viewer_created
  ON public.discover_swipe_events (viewer_id, created_at DESC);

COMMENT ON TABLE public.discover_swipe_events IS
  'Historique de swipes (like/pass) — la dernière ligne annulable par rewind.';

-- ---------------------------------------------------------------------------
-- 3) Compteur de rewinds (gratuit : max 5 / fenêtre 5 min)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discover_rewind_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discover_rewind_ledger_user_time
  ON public.discover_rewind_ledger (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Profils croisés (état + expiration 24h gratuit, illimité plus)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discover_profile_crossings (
  viewer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('seen', 'passed', 'liked')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (viewer_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_discover_crossings_viewer_expires
  ON public.discover_profile_crossings (viewer_id, expires_at);

COMMENT ON TABLE public.discover_profile_crossings IS
  'Mémoire des profils croisés; expires_at nul = visible sans limite (SPLove+).';

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.discover_swipe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discover_rewind_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discover_profile_crossings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discover_swipe_events_select_own" ON public.discover_swipe_events;
CREATE POLICY "discover_swipe_events_select_own"
  ON public.discover_swipe_events FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

-- Inserts : uniquement via record_discover_swipe (SECURITY DEFINER)

DROP POLICY IF EXISTS "discover_crossings_select_own" ON public.discover_profile_crossings;
CREATE POLICY "discover_crossings_select_own"
  ON public.discover_profile_crossings FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6) Enregistrer un swipe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_discover_swipe(
  p_target_id uuid,
  p_action text,
  p_decision_time_ms integer DEFAULT 0,
  p_is_match boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_premium boolean;
  v_a text;
  s_cross text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;
  v_a := lower(trim(p_action));
  IF p_target_id IS NULL OR p_target_id = v_uid OR v_a NOT IN ('like', 'pass') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  v_premium := public.discover_user_has_splove_plus(v_uid);

  INSERT INTO public.discover_swipe_events (
    viewer_id, target_id, action, decision_time_ms, is_match
  ) VALUES (
    v_uid, p_target_id, v_a, GREATEST(0, COALESCE(p_decision_time_ms, 0)), COALESCE(p_is_match, false)
  );

  IF v_a = 'like' THEN
    s_cross := 'liked';
  ELSE
    s_cross := 'passed';
  END IF;

  INSERT INTO public.discover_profile_crossings (
    viewer_id, target_id, state, last_interaction_at, expires_at
  ) VALUES (
    v_uid,
    p_target_id,
    s_cross,
    now(),
    CASE WHEN v_premium THEN NULL ELSE now() + interval '24 hours' END
  )
  ON CONFLICT (viewer_id, target_id) DO UPDATE SET
    state = EXCLUDED.state,
    last_interaction_at = now(),
    expires_at = CASE
      WHEN v_premium THEN NULL
      ELSE now() + interval '24 hours'
    END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_discover_swipe(uuid, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_discover_swipe(uuid, text, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Rewind — annule le dernier swipe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rewind_last_discover_swipe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_premium boolean;
  v_rewind_count_5m int;
  v_row_upd int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  SELECT * INTO e
  FROM public.discover_swipe_events
  WHERE viewer_id = v_uid
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_swipe');
  END IF;

  IF e.is_match THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_not_rewindable');
  END IF;

  v_premium := public.discover_user_has_splove_plus(v_uid);

  IF NOT v_premium THEN
    IF e.created_at < now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'time_window');
    END IF;

    SELECT count(*)::int INTO v_rewind_count_5m
    FROM public.discover_rewind_ledger
    WHERE user_id = v_uid
      AND created_at > now() - interval '5 minutes';

    IF v_rewind_count_5m >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rewind_rate');
    END IF;
  END IF;

  IF e.action = 'like' THEN
    DELETE FROM public.likes
    WHERE liker_id = v_uid AND liked_id = e.target_id;
  END IF;

  DELETE FROM public.discover_swipe_events WHERE id = e.id;

  INSERT INTO public.discover_rewind_ledger (user_id) VALUES (v_uid);

  UPDATE public.discover_profile_crossings c
  SET
    state = 'seen',
    last_interaction_at = now(),
    expires_at = CASE
      WHEN v_premium THEN NULL
      ELSE now() + interval '24 hours'
    END
  WHERE c.viewer_id = v_uid AND c.target_id = e.target_id;
  GET DIAGNOSTICS v_row_upd = ROW_COUNT;

  IF v_row_upd = 0 THEN
    INSERT INTO public.discover_profile_crossings (viewer_id, target_id, state, last_interaction_at, expires_at)
    VALUES (
      v_uid,
      e.target_id,
      'seen',
      now(),
      CASE WHEN v_premium THEN NULL ELSE now() + interval '24 hours' END
    )
    ON CONFLICT (viewer_id, target_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'target_id', e.target_id, 'action', e.action);
END;
$$;

REVOKE ALL ON FUNCTION public.rewind_last_discover_swipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rewind_last_discover_swipe() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Statut rewind (client)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_discover_rewind_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e record;
  v_premium boolean;
  v_rewind_count_5m int;
  v_can boolean;
  v_reason text := null;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_rewind', false, 'reason', 'auth', 'has_premium', false);
  END IF;

  v_premium := public.discover_user_has_splove_plus(v_uid);

  SELECT * INTO e
  FROM public.discover_swipe_events
  WHERE viewer_id = v_uid
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'no_swipe',
      'has_premium', v_premium
    );
  END IF;

  IF e.is_match THEN
    RETURN jsonb_build_object(
      'can_rewind', false,
      'reason', 'match',
      'has_premium', v_premium,
      'last_is_match', true
    );
  END IF;

  v_can := true;
  IF NOT v_premium THEN
    IF e.created_at < now() - interval '5 minutes' THEN
      v_can := false;
      v_reason := 'time_window';
    END IF;
    IF v_can THEN
      SELECT count(*)::int INTO v_rewind_count_5m
      FROM public.discover_rewind_ledger
      WHERE user_id = v_uid
        AND created_at > now() - interval '5 minutes';
      IF v_rewind_count_5m >= 5 THEN
        v_can := false;
        v_reason := 'rewind_rate';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'can_rewind', v_can,
    'reason', v_reason,
    'has_premium', v_premium,
    'last_action', e.action,
    'last_is_match', e.is_match
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_discover_rewind_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discover_rewind_status() TO authenticated;

GRANT SELECT ON public.discover_profile_crossings TO authenticated;
