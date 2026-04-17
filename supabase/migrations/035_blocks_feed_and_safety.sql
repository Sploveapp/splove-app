-- Blocages (Discover, likes, messages) + filtre feed_profiles + RPC create_like

CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT blocks_pair_unique UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own_as_blocker" ON public.blocks;
CREATE POLICY "blocks_select_own_as_blocker"
  ON public.blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_insert_self_as_blocker" ON public.blocks;
CREATE POLICY "blocks_insert_self_as_blocker"
  ON public.blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_delete_own_as_blocker" ON public.blocks;
CREATE POLICY "blocks_delete_own_as_blocker"
  ON public.blocks
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_pair_is_blocked(viewer uuid, other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT viewer IS NOT NULL
     AND other IS NOT NULL
     AND viewer IS DISTINCT FROM other
     AND EXISTS (
       SELECT 1
       FROM public.blocks b
       WHERE (b.blocker_id = viewer AND b.blocked_id = other)
          OR (b.blocker_id = other AND b.blocked_id = viewer)
     );
$$;

REVOKE ALL ON FUNCTION public.profile_pair_is_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_pair_is_blocked(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_blocked_with(p_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_pair_is_blocked(auth.uid(), p_other_user_id);
$$;

REVOKE ALL ON FUNCTION public.is_blocked_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_user_ids_blocked_with_me()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH o AS (
    SELECT
      CASE WHEN b.blocker_id = auth.uid() THEN b.blocked_id ELSE b.blocker_id END AS oid
    FROM public.blocks b
    WHERE auth.uid() IS NOT NULL
      AND (b.blocker_id = auth.uid() OR b.blocked_id = auth.uid())
  )
  SELECT COALESCE((SELECT array_agg(DISTINCT oid) FROM o WHERE oid IS NOT NULL), ARRAY[]::uuid[]);
$$;

REVOKE ALL ON FUNCTION public.list_user_ids_blocked_with_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_ids_blocked_with_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.match_has_blocked_pair(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND public.profile_pair_is_blocked(m.user_a, m.user_b)
  );
$$;

REVOKE ALL ON FUNCTION public.match_has_blocked_pair(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_has_blocked_pair(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.conversation_match_blocked(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.matches m ON m.id = c.match_id
    WHERE c.id = p_conversation_id
      AND public.profile_pair_is_blocked(m.user_a, m.user_b)
  );
$$;

REVOKE ALL ON FUNCTION public.conversation_match_blocked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversation_match_blocked(uuid) TO service_role;

CREATE OR REPLACE VIEW public.feed_profiles
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND auth.uid() IS NOT NULL
  AND NOT public.profile_pair_is_blocked(auth.uid(), p.id);

COMMENT ON VIEW public.feed_profiles IS
  'Profils likables (auth.users) hors paires bloquées avec l’utilisateur courant';

GRANT SELECT ON public.feed_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.create_like_and_get_result(p_liked_id uuid)
RETURNS TABLE (
  like_created boolean,
  is_match boolean,
  match_id uuid,
  conversation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  reciprocal boolean := false;
  ua uuid;
  ub uuid;
  mid uuid;
  cid uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_liked_id IS NULL OR p_liked_id = me THEN
    RAISE EXCEPTION 'Invalid liked user';
  END IF;
  IF public.profile_pair_is_blocked(me, p_liked_id) THEN
    RAISE EXCEPTION 'Action impossible : profil bloqué.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.likes (liker_id, liked_id)
  VALUES (me, p_liked_id)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1
    FROM public.likes
    WHERE liker_id = p_liked_id
      AND liked_id = me
  )
  INTO reciprocal;

  IF NOT reciprocal THEN
    RETURN QUERY
    SELECT true, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  ua := LEAST(me, p_liked_id);
  ub := GREATEST(me, p_liked_id);

  INSERT INTO public.matches (id, user_a, user_b, initiator_user)
  VALUES (gen_random_uuid(), ua, ub, me)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT m.id
  INTO mid
  FROM public.matches m
  WHERE m.user_a = ua
    AND m.user_b = ub
  LIMIT 1;

  IF mid IS NULL THEN
    RETURN QUERY
    SELECT true, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id
  INTO cid
  FROM public.conversations c
  WHERE c.match_id = mid
  LIMIT 1;

  IF cid IS NULL THEN
    cid := gen_random_uuid();
    INSERT INTO public.conversations (id, match_id)
    VALUES (cid, mid);
  END IF;

  RETURN QUERY
  SELECT true, true, mid, cid;
END;
$$;

COMMENT ON FUNCTION public.create_like_and_get_result(uuid) IS
  'Like ; refuse si blocage ; si réciproque : match + conversation, idempotent.';

GRANT EXECUTE ON FUNCTION public.create_like_and_get_result(uuid) TO authenticated;

DROP POLICY IF EXISTS "conversation_messages_select_participants" ON public.conversation_messages;
CREATE POLICY "conversation_messages_select_participants"
  ON public.conversation_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_messages.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversation_messages_insert_participant" ON public.conversation_messages;
CREATE POLICY "conversation_messages_insert_participant"
  ON public.conversation_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND NOT public.conversation_match_blocked(conversation_messages.conversation_id)
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_messages.conversation_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposed_by'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_insert_authenticated"
      ON public.activity_proposals
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = proposed_by
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE (m.id = activity_proposals.match_id)
             
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      );

    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        status = 'proposed'
        AND auth.uid() <> proposed_by
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE (m.id = activity_proposals.match_id)
             
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      )
      WITH CHECK (
        status IN ('accepted', 'alternative_requested', 'declined')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
      );

  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_proposals'
      AND column_name = 'proposer_id'
  ) THEN
    DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_insert_authenticated"
      ON public.activity_proposals
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = proposer_id
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE (m.id = activity_proposals.match_id)
             
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      );

    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (
        status = 'proposed'
        AND auth.uid() <> proposer_id
        AND NOT public.match_has_blocked_pair(activity_proposals.match_id)
        AND (
          activity_proposals.conversation_id IS NULL
          OR NOT public.conversation_match_blocked(activity_proposals.conversation_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE (m.id = activity_proposals.match_id)
             
            AND (auth.uid() = m.user_a OR auth.uid() = m.user_b)
        )
      )
      WITH CHECK (
        status IN ('accepted', 'alternative_requested', 'declined')
        AND responded_by = auth.uid()
        AND responded_at IS NOT NULL
      );

  ELSE
    -- Défaut sécurité : refuser toute insertion / mise à jour si colonnes inattendues.
    DROP POLICY IF EXISTS "activity_proposals_insert_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_insert_authenticated"
      ON public.activity_proposals
      FOR INSERT
      TO authenticated
      WITH CHECK (false);

    DROP POLICY IF EXISTS "activity_proposals_update_authenticated" ON public.activity_proposals;
    CREATE POLICY "activity_proposals_update_authenticated"
      ON public.activity_proposals
      FOR UPDATE
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'liker_id'
  ) THEN
    DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
    CREATE POLICY "likes_insert_own"
      ON public.likes
      FOR INSERT
      TO authenticated
      WITH CHECK (
        liker_id = auth.uid()
        AND NOT public.profile_pair_is_blocked(liker_id, liked_id)
      );
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'from_user'
  ) THEN
    DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
    CREATE POLICY "likes_insert_own"
      ON public.likes
      FOR INSERT
      TO authenticated
      WITH CHECK (
        from_user = auth.uid()
        AND NOT public.profile_pair_is_blocked(from_user, to_user)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_messages_no_active_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND public.conversation_match_blocked(NEW.conversation_id) THEN
    RAISE EXCEPTION 'Action impossible : conversation bloquée.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "matches_insert_participant" ON public.matches;
CREATE POLICY "matches_insert_participant"
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = user_a OR auth.uid() = user_b)
    AND NOT public.profile_pair_is_blocked(user_a, user_b)
  );

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_messages_enforce_no_active_block ON public.messages;
    CREATE TRIGGER trg_messages_enforce_no_active_block
      BEFORE INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_messages_no_active_block();
  END IF;
END $$;
