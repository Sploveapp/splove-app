-- Security hardening: profiles RLS (own write + controlled peer read) + conversation_windows participant scope.

-- ---------------------------------------------------------------------------
-- Helper: match participant for a conversation row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid)
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
      AND (m.user_a = auth.uid() OR m.user_b = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.is_conversation_participant(uuid) IS
  'True when auth.uid() is user_a or user_b on the match linked to the conversation.';

-- ---------------------------------------------------------------------------
-- profiles: enable RLS — own INSERT/UPDATE; peer SELECT for completed profiles only
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_discover_peers ON public.profiles;
CREATE POLICY profiles_select_discover_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id <> auth.uid()
    AND (
      COALESCE(profile_completed, false) = true
      OR COALESCE(onboarding_done, false) = true
      OR COALESCE(onboarding_completed, false) = true
    )
  );

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No client DELETE — account removal via Edge Function (service role).

REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- conversation_windows: restrict SELECT/UPDATE to match participants (was USING true)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversation_windows_select_authenticated" ON public.conversation_windows;
CREATE POLICY "conversation_windows_select_participants"
  ON public.conversation_windows
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS "conversation_windows_update_authenticated" ON public.conversation_windows;
CREATE POLICY "conversation_windows_update_participants"
  ON public.conversation_windows
  FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));
