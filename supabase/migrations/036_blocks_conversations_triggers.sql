-- Complément blocage : conversations RLS + triggers likes/matches/conversation_messages

DROP POLICY IF EXISTS "conversations_insert_match_participants" ON public.conversations;
CREATE POLICY "conversations_insert_match_participants"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
        AND NOT public.profile_pair_is_blocked(m.user_a, m.user_b)
    )
  );

DROP POLICY IF EXISTS "conversations_update_match_participants" ON public.conversations;
CREATE POLICY "conversations_update_match_participants"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = conversations.match_id
        AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_likes_no_block_liker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.profile_pair_is_blocked(NEW.liker_id, NEW.liked_id) THEN
    RAISE EXCEPTION 'Action impossible : profil bloqué.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_likes_no_block_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.profile_pair_is_blocked(NEW.from_user, NEW.to_user) THEN
    RAISE EXCEPTION 'Action impossible : profil bloqué.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_matches_no_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.profile_pair_is_blocked(NEW.user_a, NEW.user_b) THEN
    RAISE EXCEPTION 'Action impossible : profil bloqué.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_conversations_match_not_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ua uuid;
  ub uuid;
BEGIN
  SELECT m.user_a, m.user_b INTO ua, ub
  FROM public.matches m
  WHERE m.id = NEW.match_id;
  IF ua IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.profile_pair_is_blocked(ua, ub) THEN
    RAISE EXCEPTION 'Action impossible : conversation bloquée.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_enforce_match_not_blocked ON public.conversations;
CREATE TRIGGER trg_conversations_enforce_match_not_blocked
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_conversations_match_not_blocked();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'liker_id'
  ) THEN
    DROP TRIGGER IF EXISTS trg_likes_enforce_no_block ON public.likes;
    CREATE TRIGGER trg_likes_enforce_no_block
      BEFORE INSERT ON public.likes
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_likes_no_block_liker();
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'from_user'
  ) THEN
    DROP TRIGGER IF EXISTS trg_likes_enforce_no_block ON public.likes;
    CREATE TRIGGER trg_likes_enforce_no_block
      BEFORE INSERT ON public.likes
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_likes_no_block_legacy();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_matches_enforce_no_block ON public.matches;
CREATE TRIGGER trg_matches_enforce_no_block
  BEFORE INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_matches_no_block();

DO $$
BEGIN
  IF to_regclass('public.conversation_messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_conversation_messages_enforce_no_active_block ON public.conversation_messages;
    CREATE TRIGGER trg_conversation_messages_enforce_no_active_block
      BEFORE INSERT ON public.conversation_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_messages_no_active_block();
  END IF;
END $$;
