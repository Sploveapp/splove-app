-- ============================================================
-- SPLove — TEST PRO demo seed (RESET + SEED) — idempotent
-- ============================================================
--
-- What this script DOES:
-- - Targets only users flagged as `public.profiles.is_seed_demo = true` OR demo emails below.
-- - Deletes operational interactions involving those demo users:
--   likes, matches, conversations, messages, activity proposals, blocks, reports, saved places,
--   and any related rows (when the tables exist).
-- - Deletes the existing demo profiles (but NEVER touches `auth.users`).
-- - Re-inserts / upserts a coherent demo dataset + sports (no duplicates on rerun).
--
-- What this script PRESERVES:
-- - `auth.users` (never modified)
-- - `public.sports` (never deleted/modified)
-- - all non-demo real user data
--
-- NOTE:
-- - Discover feed uses `feed_profiles` which requires `auth.users.id = profiles.id`.
--   So the 5 demo accounts must already exist in `auth.users` with the demo emails below.
--   This script will only seed profiles for demo users that exist in `auth.users`.
-- ============================================================

DO $$
DECLARE
  demo_email_linda   text := 'linda.demo@splove.test';
  demo_email_lucas   text := 'lucas.demo@splove.test';
  demo_email_sofiane text := 'sofiane.demo@splove.test';
  demo_email_tom     text := 'tom.demo@splove.test';
  demo_email_eva     text := 'eva.demo@splove.test';
BEGIN
  -- Collect demo user ids from auth.users (read-only)
  CREATE TEMP TABLE tmp_demo_users AS
  SELECT u.id, u.email
  FROM auth.users u
  WHERE lower(u.email) IN (
    lower(demo_email_linda),
    lower(demo_email_lucas),
    lower(demo_email_sofiane),
    lower(demo_email_tom),
    lower(demo_email_eva)
  );

  IF (SELECT count(*) FROM tmp_demo_users) = 0 THEN
    RAISE NOTICE 'No demo users found in auth.users. Create auth users with demo emails first; seed skipped.';
    RETURN;
  END IF;

  -- Also include any existing profiles already marked is_seed_demo=true (defensive)
  CREATE TEMP TABLE tmp_demo_profile_ids AS
  SELECT p.id
  FROM public.profiles p
  WHERE p.is_seed_demo = true
  UNION
  SELECT id FROM tmp_demo_users;

  -- -------------------------
  -- 1) DELETE OPERATIONAL DATA
  -- -------------------------

  -- blocks
  IF to_regclass('public.blocks') IS NOT NULL THEN
    DELETE FROM public.blocks
    WHERE blocker_id IN (SELECT id FROM tmp_demo_profile_ids)
       OR blocked_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- reports (legacy)
  IF to_regclass('public.reports') IS NOT NULL THEN
    DELETE FROM public.reports
    WHERE reporter_id IN (SELECT id FROM tmp_demo_profile_ids)
       OR reported_profile_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- photo reports / moderation (exist in some envs)
  IF to_regclass('public.photo_reports') IS NOT NULL THEN
    DELETE FROM public.photo_reports
    WHERE reporter_user_id IN (SELECT id FROM tmp_demo_profile_ids)
       OR reported_user_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  IF to_regclass('public.photo_moderation_results') IS NOT NULL THEN
    DELETE FROM public.photo_moderation_results
    WHERE user_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- likes (modern schema)
  IF to_regclass('public.likes') IS NOT NULL THEN
    -- try modern columns liker_id / liked_id first (ignore if not present)
    BEGIN
      EXECUTE $sql$
        DELETE FROM public.likes
        WHERE liker_id IN (SELECT id FROM tmp_demo_profile_ids)
           OR liked_id IN (SELECT id FROM tmp_demo_profile_ids)
      $sql$;
    EXCEPTION WHEN undefined_column THEN
      -- fallback legacy schema from_user / to_user
      EXECUTE $sql$
        DELETE FROM public.likes
        WHERE from_user IN (SELECT id FROM tmp_demo_profile_ids)
           OR to_user   IN (SELECT id FROM tmp_demo_profile_ids)
      $sql$;
    END;
  END IF;

  -- matches + conversations + messages (chat)
  IF to_regclass('public.matches') IS NOT NULL THEN
    -- delete activity proposals linked to conversations of demo matches
    IF to_regclass('public.activity_proposals') IS NOT NULL THEN
      DELETE FROM public.activity_proposals ap
      WHERE ap.conversation_id IN (
        SELECT c.id
        FROM public.conversations c
        JOIN public.matches m ON m.id = c.match_id
        WHERE m.user_a IN (SELECT id FROM tmp_demo_profile_ids)
           OR m.user_b IN (SELECT id FROM tmp_demo_profile_ids)
      )
      OR ap.proposer_id IN (SELECT id FROM tmp_demo_profile_ids)
      OR ap.responded_by IN (SELECT id FROM tmp_demo_profile_ids);
    END IF;

    -- delete conversation_messages if present
    IF to_regclass('public.conversation_messages') IS NOT NULL THEN
      DELETE FROM public.conversation_messages cm
      WHERE cm.conversation_id IN (
        SELECT c.id
        FROM public.conversations c
        JOIN public.matches m ON m.id = c.match_id
        WHERE m.user_a IN (SELECT id FROM tmp_demo_profile_ids)
           OR m.user_b IN (SELECT id FROM tmp_demo_profile_ids)
      );
    END IF;

    -- delete messages table if present (newer chat table)
    IF to_regclass('public.messages') IS NOT NULL THEN
      DELETE FROM public.messages msg
      WHERE msg.conversation_id IN (
        SELECT c.id
        FROM public.conversations c
        JOIN public.matches m ON m.id = c.match_id
        WHERE m.user_a IN (SELECT id FROM tmp_demo_profile_ids)
           OR m.user_b IN (SELECT id FROM tmp_demo_profile_ids)
      )
      OR msg.sender_id IN (SELECT id FROM tmp_demo_profile_ids);
    END IF;

    -- delete conversations for demo matches
    IF to_regclass('public.conversations') IS NOT NULL THEN
      DELETE FROM public.conversations c
      WHERE c.match_id IN (
        SELECT m.id
        FROM public.matches m
        WHERE m.user_a IN (SELECT id FROM tmp_demo_profile_ids)
           OR m.user_b IN (SELECT id FROM tmp_demo_profile_ids)
      );
    END IF;

    -- delete matches
    DELETE FROM public.matches m
    WHERE m.user_a IN (SELECT id FROM tmp_demo_profile_ids)
       OR m.user_b IN (SELECT id FROM tmp_demo_profile_ids)
       OR m.initiator_user IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- saved places (Discover teaser)
  IF to_regclass('public.profile_saved_places') IS NOT NULL THEN
    DELETE FROM public.profile_saved_places
    WHERE profile_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- profile sports
  IF to_regclass('public.profile_sports') IS NOT NULL THEN
    DELETE FROM public.profile_sports
    WHERE profile_id IN (SELECT id FROM tmp_demo_profile_ids);
  END IF;

  -- finally delete demo profiles (only those flagged or matching demo emails' ids)
  DELETE FROM public.profiles
  WHERE id IN (SELECT id FROM tmp_demo_profile_ids);

  -- -------------------------
  -- 2) RE-INSERT DEMO PROFILES
  -- -------------------------
  -- Keep deterministic based on auth.users ids (no auth modifications).

  -- Helper: upsert profile row by email
  -- Linda Demo (Femme, looking_for Homme, sports: tennis + randonnee)
  INSERT INTO public.profiles (
    id,
    first_name,
    gender,
    looking_for,
    birth_date,
    city,
    sport_phrase,
    profile_completed,
    onboarding_completed,
    onboarding_done,
    photo_status,
    photo_verification_status,
    portrait_photo_status,
    body_photo_status,
    portrait_url,
    fullbody_url,
    main_photo_url,
    is_seed_demo
  )
  SELECT
    u.id,
    'Linda',
    'Femme',
    'Homme',
    '1996-04-12',
    'Paris',
    'Tennis ou rando ? Je suis partante pour une sortie simple et cool.',
    true,
    true,
    true,
    'approved',
    'approved',
    'approved',
    'approved',
    'https://picsum.photos/seed/splove-linda-portrait/800/1000',
    'https://picsum.photos/seed/splove-linda-body/800/1000',
    'https://picsum.photos/seed/splove-linda-main/800/1000',
    true
  FROM tmp_demo_users u
  WHERE lower(u.email) = lower(demo_email_linda)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    gender = EXCLUDED.gender,
    looking_for = EXCLUDED.looking_for,
    birth_date = EXCLUDED.birth_date,
    city = EXCLUDED.city,
    sport_phrase = EXCLUDED.sport_phrase,
    profile_completed = EXCLUDED.profile_completed,
    onboarding_completed = EXCLUDED.onboarding_completed,
    onboarding_done = EXCLUDED.onboarding_done,
    photo_status = EXCLUDED.photo_status,
    photo_verification_status = EXCLUDED.photo_verification_status,
    portrait_photo_status = EXCLUDED.portrait_photo_status,
    body_photo_status = EXCLUDED.body_photo_status,
    portrait_url = EXCLUDED.portrait_url,
    fullbody_url = EXCLUDED.fullbody_url,
    main_photo_url = EXCLUDED.main_photo_url,
    is_seed_demo = EXCLUDED.is_seed_demo;

  -- Lucas Demo (Homme, looking_for Femme, sports: tennis + padel)
  INSERT INTO public.profiles (
    id, first_name, gender, looking_for, birth_date, city, sport_phrase,
    profile_completed, onboarding_completed, onboarding_done,
    photo_status, photo_verification_status, portrait_photo_status, body_photo_status,
    portrait_url, fullbody_url, main_photo_url, is_seed_demo
  )
  SELECT
    u.id,
    'Lucas',
    'Homme',
    'Femme',
    '1994-09-03',
    'Lyon',
    'Plutôt match de tennis ou padel ? Je propose un créneau et on y va.',
    true, true, true,
    'approved', 'approved', 'approved', 'approved',
    'https://picsum.photos/seed/splove-lucas-portrait/800/1000',
    'https://picsum.photos/seed/splove-lucas-body/800/1000',
    'https://picsum.photos/seed/splove-lucas-main/800/1000',
    true
  FROM tmp_demo_users u
  WHERE lower(u.email) = lower(demo_email_lucas)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    gender = EXCLUDED.gender,
    looking_for = EXCLUDED.looking_for,
    birth_date = EXCLUDED.birth_date,
    city = EXCLUDED.city,
    sport_phrase = EXCLUDED.sport_phrase,
    profile_completed = EXCLUDED.profile_completed,
    onboarding_completed = EXCLUDED.onboarding_completed,
    onboarding_done = EXCLUDED.onboarding_done,
    photo_status = EXCLUDED.photo_status,
    photo_verification_status = EXCLUDED.photo_verification_status,
    portrait_photo_status = EXCLUDED.portrait_photo_status,
    body_photo_status = EXCLUDED.body_photo_status,
    portrait_url = EXCLUDED.portrait_url,
    fullbody_url = EXCLUDED.fullbody_url,
    main_photo_url = EXCLUDED.main_photo_url,
    is_seed_demo = EXCLUDED.is_seed_demo;

  -- Sofiane Demo (Homme, looking_for Femme, sports: running + randonnee)
  INSERT INTO public.profiles (
    id, first_name, gender, looking_for, birth_date, city, sport_phrase,
    profile_completed, onboarding_completed, onboarding_done,
    photo_status, photo_verification_status, portrait_photo_status, body_photo_status,
    portrait_url, fullbody_url, main_photo_url, is_seed_demo
  )
  SELECT
    u.id,
    'Sofiane',
    'Homme',
    'Femme',
    '1992-01-18',
    'Marseille',
    'Running le matin, rando le week-end. Partant pour une sortie active.',
    true, true, true,
    'approved', 'approved', 'approved', 'approved',
    'https://picsum.photos/seed/splove-sofiane-portrait/800/1000',
    'https://picsum.photos/seed/splove-sofiane-body/800/1000',
    'https://picsum.photos/seed/splove-sofiane-main/800/1000',
    true
  FROM tmp_demo_users u
  WHERE lower(u.email) = lower(demo_email_sofiane)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    gender = EXCLUDED.gender,
    looking_for = EXCLUDED.looking_for,
    birth_date = EXCLUDED.birth_date,
    city = EXCLUDED.city,
    sport_phrase = EXCLUDED.sport_phrase,
    profile_completed = EXCLUDED.profile_completed,
    onboarding_completed = EXCLUDED.onboarding_completed,
    onboarding_done = EXCLUDED.onboarding_done,
    photo_status = EXCLUDED.photo_status,
    photo_verification_status = EXCLUDED.photo_verification_status,
    portrait_photo_status = EXCLUDED.portrait_photo_status,
    body_photo_status = EXCLUDED.body_photo_status,
    portrait_url = EXCLUDED.portrait_url,
    fullbody_url = EXCLUDED.fullbody_url,
    main_photo_url = EXCLUDED.main_photo_url,
    is_seed_demo = EXCLUDED.is_seed_demo;

  -- Tom Demo (Homme, looking_for Femme, sports: fitness + tennis)
  INSERT INTO public.profiles (
    id, first_name, gender, looking_for, birth_date, city, sport_phrase,
    profile_completed, onboarding_completed, onboarding_done,
    photo_status, photo_verification_status, portrait_photo_status, body_photo_status,
    portrait_url, fullbody_url, main_photo_url, is_seed_demo
  )
  SELECT
    u.id,
    'Tom',
    'Homme',
    'Femme',
    '1997-07-22',
    'Bordeaux',
    'Fitness pour l’énergie, tennis pour le fun. On tente une sortie ?',
    true, true, true,
    'approved', 'approved', 'approved', 'approved',
    'https://picsum.photos/seed/splove-tom-portrait/800/1000',
    'https://picsum.photos/seed/splove-tom-body/800/1000',
    'https://picsum.photos/seed/splove-tom-main/800/1000',
    true
  FROM tmp_demo_users u
  WHERE lower(u.email) = lower(demo_email_tom)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    gender = EXCLUDED.gender,
    looking_for = EXCLUDED.looking_for,
    birth_date = EXCLUDED.birth_date,
    city = EXCLUDED.city,
    sport_phrase = EXCLUDED.sport_phrase,
    profile_completed = EXCLUDED.profile_completed,
    onboarding_completed = EXCLUDED.onboarding_completed,
    onboarding_done = EXCLUDED.onboarding_done,
    photo_status = EXCLUDED.photo_status,
    photo_verification_status = EXCLUDED.photo_verification_status,
    portrait_photo_status = EXCLUDED.portrait_photo_status,
    body_photo_status = EXCLUDED.body_photo_status,
    portrait_url = EXCLUDED.portrait_url,
    fullbody_url = EXCLUDED.fullbody_url,
    main_photo_url = EXCLUDED.main_photo_url,
    is_seed_demo = EXCLUDED.is_seed_demo;

  -- Eva Demo (Femme, looking_for Homme, sports: tennis)
  -- NOTE: This is intentionally sport-incompatible with Linda (to validate Discover exclusion by shared sports).
  INSERT INTO public.profiles (
    id, first_name, gender, looking_for, birth_date, city, sport_phrase,
    profile_completed, onboarding_completed, onboarding_done,
    photo_status, photo_verification_status, portrait_photo_status, body_photo_status,
    portrait_url, fullbody_url, main_photo_url, is_seed_demo
  )
  SELECT
    u.id,
    'Eva',
    'Femme',
    'Homme',
    '1999-11-09',
    'Nantes',
    'Tennis et bonne humeur. Je suis là pour une vraie sortie.',
    true, true, true,
    'approved', 'approved', 'approved', 'approved',
    'https://picsum.photos/seed/splove-eva-portrait/800/1000',
    'https://picsum.photos/seed/splove-eva-body/800/1000',
    'https://picsum.photos/seed/splove-eva-main/800/1000',
    true
  FROM tmp_demo_users u
  WHERE lower(u.email) = lower(demo_email_eva)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    gender = EXCLUDED.gender,
    looking_for = EXCLUDED.looking_for,
    birth_date = EXCLUDED.birth_date,
    city = EXCLUDED.city,
    sport_phrase = EXCLUDED.sport_phrase,
    profile_completed = EXCLUDED.profile_completed,
    onboarding_completed = EXCLUDED.onboarding_completed,
    onboarding_done = EXCLUDED.onboarding_done,
    photo_status = EXCLUDED.photo_status,
    photo_verification_status = EXCLUDED.photo_verification_status,
    portrait_photo_status = EXCLUDED.portrait_photo_status,
    body_photo_status = EXCLUDED.body_photo_status,
    portrait_url = EXCLUDED.portrait_url,
    fullbody_url = EXCLUDED.fullbody_url,
    main_photo_url = EXCLUDED.main_photo_url,
    is_seed_demo = EXCLUDED.is_seed_demo;

  -- -------------------------
  -- 3) SEED SPORTS (no touch public.sports)
  -- -------------------------
  -- Use sports.slug matching, insert into profile_sports with ON CONFLICT DO NOTHING.

  IF to_regclass('public.profile_sports') IS NOT NULL THEN
    -- Resolve sport IDs from catalog
    CREATE TEMP TABLE tmp_demo_sports AS
    SELECT id, lower(trim(slug)) AS slug
    FROM public.sports
    WHERE lower(trim(slug)) IN ('tennis', 'randonnee', 'padel', 'running', 'fitness');

    -- Linda: tennis + randonnee
    INSERT INTO public.profile_sports (profile_id, sport_id, level)
    SELECT p.id, s.id, NULL
    FROM public.profiles p
    JOIN tmp_demo_users u ON u.id = p.id AND lower(u.email) = lower(demo_email_linda)
    JOIN tmp_demo_sports s ON s.slug IN ('tennis', 'randonnee')
    ON CONFLICT (profile_id, sport_id) DO NOTHING;

    -- Lucas: tennis + padel
    INSERT INTO public.profile_sports (profile_id, sport_id, level)
    SELECT p.id, s.id, NULL
    FROM public.profiles p
    JOIN tmp_demo_users u ON u.id = p.id AND lower(u.email) = lower(demo_email_lucas)
    JOIN tmp_demo_sports s ON s.slug IN ('tennis', 'padel')
    ON CONFLICT (profile_id, sport_id) DO NOTHING;

    -- Sofiane: running + randonnee
    INSERT INTO public.profile_sports (profile_id, sport_id, level)
    SELECT p.id, s.id, NULL
    FROM public.profiles p
    JOIN tmp_demo_users u ON u.id = p.id AND lower(u.email) = lower(demo_email_sofiane)
    JOIN tmp_demo_sports s ON s.slug IN ('running', 'randonnee')
    ON CONFLICT (profile_id, sport_id) DO NOTHING;

    -- Tom: fitness + tennis
    INSERT INTO public.profile_sports (profile_id, sport_id, level)
    SELECT p.id, s.id, NULL
    FROM public.profiles p
    JOIN tmp_demo_users u ON u.id = p.id AND lower(u.email) = lower(demo_email_tom)
    JOIN tmp_demo_sports s ON s.slug IN ('fitness', 'tennis')
    ON CONFLICT (profile_id, sport_id) DO NOTHING;

    -- Eva: tennis only
    INSERT INTO public.profile_sports (profile_id, sport_id, level)
    SELECT p.id, s.id, NULL
    FROM public.profiles p
    JOIN tmp_demo_users u ON u.id = p.id AND lower(u.email) = lower(demo_email_eva)
    JOIN tmp_demo_sports s ON s.slug IN ('tennis')
    ON CONFLICT (profile_id, sport_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'SPLove demo seed complete. Demo profiles seeded: %', (SELECT count(*) FROM tmp_demo_users);
END $$;

