-- Post-match 48h window (MVP):
-- stores when the "propose an activity" window starts and who can send first message.

CREATE TABLE IF NOT EXISTS public.conversation_windows (
  conversation_id UUID PRIMARY KEY,
  window_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  match_initiator_id UUID NOT NULL,
  allowed_first_sender_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_windows_opened_at
  ON public.conversation_windows (window_opened_at DESC);

CREATE OR REPLACE FUNCTION public.touch_conversation_windows_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_windows_updated_at ON public.conversation_windows;
CREATE TRIGGER trg_conversation_windows_updated_at
BEFORE UPDATE ON public.conversation_windows
FOR EACH ROW
EXECUTE FUNCTION public.touch_conversation_windows_updated_at();

ALTER TABLE public.conversation_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_windows_select_authenticated" ON public.conversation_windows;
CREATE POLICY "conversation_windows_select_authenticated"
  ON public.conversation_windows
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "conversation_windows_upsert_authenticated" ON public.conversation_windows;
CREATE POLICY "conversation_windows_upsert_authenticated"
  ON public.conversation_windows
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = match_initiator_id);

DROP POLICY IF EXISTS "conversation_windows_update_authenticated" ON public.conversation_windows;
CREATE POLICY "conversation_windows_update_authenticated"
  ON public.conversation_windows
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
