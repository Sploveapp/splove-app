-- P0 — débloquer deleteUser / Auth (erreur prod 23503 subscriptions_user_id_fkey).
-- subscriptions.profile_id → auth.users ON DELETE SET NULL.
-- Conserve les lignes et external_id. Pas de DELETE Apple.
-- Hors P0 : profile_boosts, profils orphelins, tombstone, RPC (voir 158).
-- Play / Destination / offres SPLove+ : inchangés.

-- ---------------------------------------------------------------------------
-- 0) Aucune autre FK NO ACTION / RESTRICT que subscriptions (traitée) et
--    profile_boosts (reportée, 158).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  blockers text;
BEGIN
  SELECT string_agg(format('%I.%I %I', n.nspname, c.relname, con.conname), ', ' ORDER BY n.nspname, c.relname)
  INTO blockers
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype = 'f'
    AND con.confrelid = 'auth.users'::regclass
    AND con.confdeltype IN ('a', 'r')
    AND n.nspname NOT IN ('auth', 'pg_catalog', 'information_schema')
    AND NOT (n.nspname = 'public' AND c.relname IN ('subscriptions', 'profile_boosts'));

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_auth_users_restrict_fk: %', blockers;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) SET NULL — drop uniquement la FK attendue, sinon abort
--    Prod : subscriptions_user_id_fkey (profile_id → auth.users, NO ACTION).
--    Docker local (002) : subscriptions_profile_id_fkey (profile_id → profiles).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
  v_name text;
  v_col text;
  v_ncols integer;
  v_conf oid;
  v_del char;
  v_drop text;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'subscriptions'
    AND con.contype = 'f';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'unexpected_subscriptions_fk_count: %', v_count;
  END IF;

  SELECT con.conname,
         con.confrelid,
         con.confdeltype,
         array_length(con.conkey, 1),
         (
           SELECT att.attname
           FROM pg_attribute att
           WHERE att.attrelid = con.conrelid
             AND att.attnum = con.conkey[1]
         )
  INTO v_name, v_conf, v_del, v_ncols, v_col
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'subscriptions'
    AND con.contype = 'f';

  IF v_ncols IS DISTINCT FROM 1 OR v_col IS DISTINCT FROM 'profile_id' THEN
    RAISE EXCEPTION 'unexpected_subscriptions_fk_columns: name=% col=% ncols=%', v_name, v_col, v_ncols;
  END IF;

  IF v_name = 'subscriptions_user_id_fkey'
     AND v_conf = 'auth.users'::regclass
     AND v_del IN ('a', 'r')
  THEN
    v_drop := 'subscriptions_user_id_fkey';
  ELSIF v_name = 'subscriptions_profile_id_fkey'
     AND v_conf = 'public.profiles'::regclass
  THEN
    -- Reset Docker uniquement (002). Interdit en production.
    v_drop := 'subscriptions_profile_id_fkey';
  ELSE
    RAISE EXCEPTION 'unexpected_subscriptions_fk_shape: name=% conf=% on_delete=% col=%',
      v_name, v_conf::regclass, v_del, v_col;
  END IF;

  EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', v_drop);
END $$;

ALTER TABLE public.subscriptions
  ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_profile_id_auth_users_fkey
  FOREIGN KEY (profile_id) REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT subscriptions_profile_id_auth_users_fkey ON public.subscriptions IS
  'P0 : suppression Auth détache la ligne Apple (SET NULL). Jamais DELETE ni rewrite external_id.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_apple_external_id
  ON public.subscriptions (provider, external_id)
  WHERE provider = 'apple' AND external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Anti-réattribution Apple
--    SET NULL (ON DELETE / UPDATE profile_id = NULL) : autorisé.
--    Changement de profile_id vers un UUID : interdit dès que la ligne était
--    une transaction Apple (provider + external_id), même si l’UPDATE modifie
--    aussi provider et/ou external_id.
--    Même compte (profile_id inchangé) : renouvellement / restauration OK.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscriptions_prevent_apple_rebind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.provider = 'apple'
     AND OLD.external_id IS NOT NULL
     AND NEW.profile_id IS NOT NULL
     AND OLD.profile_id IS DISTINCT FROM NEW.profile_id
  THEN
    RAISE EXCEPTION 'subscription_owned_by_other_account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_prevent_apple_rebind ON public.subscriptions;
CREATE TRIGGER subscriptions_prevent_apple_rebind
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.subscriptions_prevent_apple_rebind();

-- ---------------------------------------------------------------------------
-- 3) Post-check P0 : plus de NO ACTION hors profile_boosts (volontairement reporté)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  blockers text;
BEGIN
  SELECT string_agg(format('%I.%I %I', n.nspname, c.relname, con.conname), ', ')
  INTO blockers
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype = 'f'
    AND con.confrelid = 'auth.users'::regclass
    AND con.confdeltype IN ('a', 'r')
    AND n.nspname NOT IN ('auth', 'pg_catalog', 'information_schema')
    AND NOT (n.nspname = 'public' AND c.relname = 'profile_boosts');

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'auth_users_restrict_fk_remain: %', blockers;
  END IF;
END $$;
