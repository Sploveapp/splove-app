-- Suite de 157 (SET NULL Apple inchangé). Hors P0.
-- Boosts CASCADE, profil cible supprimé, likes/matchs/fils du compte retirés.
-- Preuves de signalement archivées hors UI. 6 orphelins historiques : non touchés.
-- Play / Destination / catalogue SPLove+ : inchangés.
-- Photos : uniquement via l’API Storage (pas de DELETE SQL storage.objects).
-- Durée de conservation evidence : account_deletion_evidence_retention() (24 mois, à valider juridiquement).

-- ---------------------------------------------------------------------------
-- 1) profile_boosts → auth.users ON DELETE CASCADE (colonne owner détectée)
-- ---------------------------------------------------------------------------
-- profile_boosts : ON DELETE CASCADE déjà corrigé dans Supabase.
-- Aucune modification nécessaire ici.

-- ---------------------------------------------------------------------------
-- 2) profiles.id → auth.users ON DELETE CASCADE
--    Si des orphelins existent : skip (pas de DELETE, pas d’ABORT).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  orphan_count bigint;
  r record;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

  IF orphan_count > 0 THEN
  RAISE NOTICE 'profiles_orphans_skip_fk: %', orphan_count;
  RETURN;
END IF;

  FOR r IN
  SELECT con.conname
  FROM pg_constraint con
  WHERE con.conrelid = 'public.profiles'::regclass
    AND con.contype = 'f'
    AND con.confrelid = 'auth.users'::regclass
    AND con.confdeltype <> 'c'
AND con.conkey = ARRAY[
  (SELECT attnum
   FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
     AND attname = 'id')
]::smallint[]
AND con.confkey = ARRAY[
  (SELECT attnum
   FROM pg_attribute
   WHERE attrelid = 'auth.users'::regclass
     AND attname = 'id')
]::smallint[]

LOOP
  EXECUTE format(
    'ALTER TABLE public.profiles DROP CONSTRAINT %I',
    r.conname
  );
END LOOP;

IF NOT EXISTS (
  SELECT 1
  FROM pg_constraint con
  WHERE con.conrelid = 'public.profiles'::regclass
    AND con.contype = 'f'
    AND con.confrelid = 'auth.users'::regclass
    AND con.confdeltype = 'c'
    AND con.conkey = ARRAY[
  (SELECT attnum FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
   AND attname = 'id')
]::smallint[]
AND con.confkey = ARRAY[
  (SELECT attnum FROM pg_attribute
   WHERE attrelid = 'auth.users'::regclass
   AND attname = 'id')
]::smallint[]
   
) THEN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Tombstone (pas de FK vers auth.users : survit à deleteUser)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'db_deleted', 'storage_pending', 'failed', 'completed')),
  storage_removed integer NOT NULL DEFAULT 0,
  storage_attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  alerted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS storage_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

COMMENT ON TABLE public.account_deletion_requests IS
  'Demande de suppression. Sans FK Auth : reprise Storage automatique (next_retry_at) si les photos restent.';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_deletion_requests_select_own" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_select_own"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.account_deletion_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_deletion_requests TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.account_deletion_requests
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b) Preuves de signalement — hors UI, sans FK Auth/profils
--     Durée : account_deletion_evidence_retention() (à valider juridiquement).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('profile_report', 'user_report', 'photo_report')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL
);

COMMENT ON TABLE public.account_deletion_evidence IS
  'Archive minimale des signalements (ids, motif, dates). Pas de conversation. Pas d’accès utilisateur.';

COMMENT ON COLUMN public.account_deletion_evidence.retain_until IS
  'now() + account_deletion_evidence_retention(). Durée à valider juridiquement.';

CREATE OR REPLACE FUNCTION public.account_deletion_evidence_retention()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT INTERVAL '24 months';
$$;

COMMENT ON FUNCTION public.account_deletion_evidence_retention() IS
  'Durée de conservation des preuves. Valeur 24 months à valider juridiquement. Modifier ici uniquement.';

REVOKE ALL ON FUNCTION public.account_deletion_evidence_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_evidence_retention() TO service_role;

ALTER TABLE public.account_deletion_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_deletion_evidence TO service_role;

-- Signalements live : SET NULL pour ne pas détruire la preuve au DELETE profil/Auth.
DO $$
DECLARE
  r record;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['photo_reports', 'profile_reports', 'user_reports', 'reports']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    IF t = 'photo_reports' THEN
      ALTER TABLE public.photo_reports ALTER COLUMN reported_user_id DROP NOT NULL;
      ALTER TABLE public.photo_reports ALTER COLUMN reporter_user_id DROP NOT NULL;
    ELSIF t = 'profile_reports' THEN
      ALTER TABLE public.profile_reports ALTER COLUMN reported_profile_id DROP NOT NULL;
      ALTER TABLE public.profile_reports ALTER COLUMN reporter_profile_id DROP NOT NULL;
    ELSIF t = 'user_reports' THEN
      ALTER TABLE public.user_reports ALTER COLUMN reported_user_id DROP NOT NULL;
      ALTER TABLE public.user_reports ALTER COLUMN reporter_id DROP NOT NULL;
    ELSIF t = 'reports' THEN
      ALTER TABLE public.reports ALTER COLUMN reported_id DROP NOT NULL;
      ALTER TABLE public.reports ALTER COLUMN reporter_id DROP NOT NULL;
    END IF;

    FOR r IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND con.contype = 'f'
        AND con.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);
    END LOOP;
  END LOOP;

  IF to_regclass('public.photo_reports') IS NOT NULL THEN
    ALTER TABLE public.photo_reports
      ADD CONSTRAINT photo_reports_reported_user_id_fkey
      FOREIGN KEY (reported_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
    ALTER TABLE public.photo_reports
      ADD CONSTRAINT photo_reports_reporter_user_id_fkey
      FOREIGN KEY (reporter_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.profile_reports') IS NOT NULL THEN
    ALTER TABLE public.profile_reports
      ADD CONSTRAINT profile_reports_reported_profile_id_fkey
      FOREIGN KEY (reported_profile_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
    ALTER TABLE public.profile_reports
      ADD CONSTRAINT profile_reports_reporter_profile_id_fkey
      FOREIGN KEY (reporter_profile_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.user_reports') IS NOT NULL THEN
    ALTER TABLE public.user_reports
      ADD CONSTRAINT user_reports_reported_user_id_fkey
      FOREIGN KEY (reported_user_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
    ALTER TABLE public.user_reports
      ADD CONSTRAINT user_reports_reporter_id_fkey
      FOREIGN KEY (reporter_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.reports') IS NOT NULL THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_reported_id_fkey
      FOREIGN KEY (reported_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_reporter_id_fkey
      FOREIGN KEY (reporter_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) handle_new_user
--    Production actuelle : INSERT (id, created_at). On conserve cette liste.
--    profile_completed et onboarding_variant restent au défaut / au client.
--    Tombstone : aucun profil si cet user_id a déjà une demande de suppression.
--    search_path fixé à pg_catalog. now() est qualifié.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_requests AS d
    WHERE d.user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, created_at)
  VALUES (NEW.id, pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC : une transaction — profil + Auth ; Apple SET NULL via 157
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
  v_retain timestamptz;
  v_blockers text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id' USING ERRCODE = '22023';
  END IF;

  v_retain := pg_catalog.now() + public.account_deletion_evidence_retention();

  SELECT d.status INTO v_status
  FROM public.account_deletion_requests AS d
  WHERE d.user_id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'deletion_not_started' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  IF to_regclass('public.photo_reports') IS NOT NULL THEN
    INSERT INTO public.account_deletion_evidence (deleted_user_id, kind, payload, retain_until)
    SELECT p_user_id, 'photo_report',
           pg_catalog.jsonb_build_object(
             'id', pr.id,
             'reporter_user_id', pr.reporter_user_id,
             'reported_user_id', pr.reported_user_id,
             'photo_slot', pr.photo_slot,
             'reason', pr.reason,
             'status', pr.status,
             'created_at', pr.created_at
           ),
           v_retain
    FROM public.photo_reports AS pr
    WHERE pr.reporter_user_id = p_user_id OR pr.reported_user_id = p_user_id;
  END IF;

  IF to_regclass('public.profile_reports') IS NOT NULL THEN
    INSERT INTO public.account_deletion_evidence (deleted_user_id, kind, payload, retain_until)
    SELECT p_user_id, 'profile_report',
           pg_catalog.jsonb_build_object(
             'id', pr.id,
             'reporter_profile_id', pr.reporter_profile_id,
             'reported_profile_id', pr.reported_profile_id,
             'reason', pr.reason,
             'created_at', pr.created_at
           ),
           v_retain
    FROM public.profile_reports AS pr
    WHERE pr.reporter_profile_id = p_user_id OR pr.reported_profile_id = p_user_id;
  END IF;

  IF to_regclass('public.user_reports') IS NOT NULL THEN
    INSERT INTO public.account_deletion_evidence (deleted_user_id, kind, payload, retain_until)
    SELECT p_user_id, 'user_report',
           pg_catalog.jsonb_build_object(
             'id', ur.id,
             'reporter_id', ur.reporter_id,
             'reported_user_id', ur.reported_user_id,
             'reason', ur.reason,
             'created_at', ur.created_at
           ),
           v_retain
    FROM public.user_reports AS ur
    WHERE ur.reporter_id = p_user_id OR ur.reported_user_id = p_user_id;
  END IF;

  IF to_regclass('public.reports') IS NOT NULL THEN
    INSERT INTO public.account_deletion_evidence (deleted_user_id, kind, payload, retain_until)
    SELECT p_user_id, 'profile_report',
           pg_catalog.jsonb_build_object(
             'id', r.id,
             'reporter_id', r.reporter_id,
             'reported_id', r.reported_id,
             'reason', r.reason,
             'created_at', r.created_at
           ),
           v_retain
    FROM public.reports AS r
    WHERE r.reporter_id = p_user_id OR r.reported_id = p_user_id;
  END IF;

  IF to_regclass('public.likes') IS NOT NULL THEN
    DELETE FROM public.likes AS l
    WHERE l.liker_id = p_user_id OR l.liked_id = p_user_id;
  END IF;

  IF to_regclass('public.activity_proposals') IS NOT NULL THEN
    DELETE FROM public.activity_proposals AS ap
    WHERE ap.proposer_id = p_user_id;
    UPDATE public.activity_proposals AS ap
    SET responded_by = NULL
    WHERE ap.responded_by = p_user_id;
  END IF;

  IF to_regclass('public.activity_proposal_responses') IS NOT NULL THEN
    DELETE FROM public.activity_proposal_responses AS r
    WHERE r.responder_id = p_user_id;
  END IF;

  DELETE FROM public.profiles AS p WHERE p.id = p_user_id;

  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_user_id) THEN
    SELECT string_agg(format('%I.%I %I', n.nspname, c.relname, con.conname), ', ')
    INTO v_blockers
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.profiles'::regclass
      AND con.confdeltype IN ('a', 'r');
    RAISE EXCEPTION 'profile_still_present: %', coalesce(v_blockers, 'unknown')
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM auth.users AS u WHERE u.id = p_user_id;

  IF EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'auth_user_still_present' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.account_deletion_requests AS d
  SET status = 'db_deleted',
      last_error = NULL,
      updated_at = pg_catalog.now()
  WHERE d.user_id = p_user_id;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'already_completed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_account_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_account_deletion(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_account_deletion(uuid) TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.commit_account_deletion(uuid) FROM authenticator;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

COMMENT ON FUNCTION public.commit_account_deletion(uuid) IS
  'Supprime profil + auth.users (likes, matchs/fils, boosts). Apple SET NULL (157). Archive minimale des reports. Pas de Storage SQL. search_path=pg_catalog. service_role.';

CREATE OR REPLACE FUNCTION public.claim_account_deletion_storage_jobs(p_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid, storage_attempts integer, storage_removed integer, alerted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_limit integer;
BEGIN
  v_limit := p_limit;
  IF v_limit IS NULL OR v_limit < 1 THEN
    v_limit := 20;
  END IF;
  IF v_limit > 50 THEN
    v_limit := 50;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT r.user_id
    FROM public.account_deletion_requests AS r
    WHERE r.status IN ('db_deleted', 'storage_pending')
      AND (r.next_retry_at IS NULL OR r.next_retry_at <= pg_catalog.now())
    ORDER BY r.updated_at ASC
    LIMIT v_limit
    FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE public.account_deletion_requests AS t
  SET next_retry_at = pg_catalog.now() + interval '2 minutes',
      updated_at = pg_catalog.now()
  FROM due
  WHERE t.user_id = due.user_id
  RETURNING t.user_id, t.storage_attempts, t.storage_removed, t.alerted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_jobs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_jobs(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_storage_jobs(integer) TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_jobs(integer) FROM authenticator;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

COMMENT ON FUNCTION public.claim_account_deletion_storage_jobs(integer) IS
  'Claim idempotent des tombstones photos dues. service_role only. Ne touche pas subscriptions.';

CREATE OR REPLACE FUNCTION public.purge_account_deletion_evidence(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz;
  v_n integer;
BEGIN
  v_now := COALESCE(p_now, pg_catalog.now());
  DELETE FROM public.account_deletion_evidence AS e
  WHERE e.retain_until <= v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_account_deletion_evidence(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_account_deletion_evidence(timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_evidence(timestamptz) TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.purge_account_deletion_evidence(timestamptz) FROM authenticator;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

COMMENT ON FUNCTION public.purge_account_deletion_evidence(timestamptz) IS
  'Purge les preuves dont retain_until est dépassé. p_now injectable pour tests. service_role. À planifier (cron) après validation juridique de la durée.';
