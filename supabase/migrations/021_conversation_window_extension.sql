-- Premium extension: +24h once per conversation window.

ALTER TABLE public.conversation_windows
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extended_once BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extended_by UUID;

UPDATE public.conversation_windows
SET window_expires_at = COALESCE(window_expires_at, window_opened_at + INTERVAL '48 hours')
WHERE window_expires_at IS NULL;
