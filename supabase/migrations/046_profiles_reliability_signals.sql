-- Anti-fantôme : signaux dénormalisés (messages) pour tri fiabilité Discover.
-- last_reply_at : dernier envoi dans une conversation (sender_id)
-- messages_count : nombre de messages envoyés

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS messages_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_reply_at IS 'Dernier message envoyé (conversation_messages.sender_id)';
COMMENT ON COLUMN public.profiles.messages_count IS 'Nombre total de messages envoyés (dénormalisé)';

UPDATE public.profiles p
SET
  messages_count = COALESCE(m.c, 0),
  last_reply_at = m.last_at
FROM (
  SELECT
    sender_id AS pid,
    COUNT(*)::integer AS c,
    MAX(created_at) AS last_at
  FROM public.conversation_messages
  GROUP BY sender_id
) m
WHERE p.id = m.pid;

CREATE OR REPLACE FUNCTION public.touch_profile_message_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    messages_count = messages_count + 1,
    last_reply_at = NEW.created_at
  WHERE id = NEW.sender_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_messages_profile_stats ON public.conversation_messages;
CREATE TRIGGER trg_conversation_messages_profile_stats
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_profile_message_stats();

COMMENT ON FUNCTION public.touch_profile_message_stats() IS
  'Incrémente messages_count et met à jour last_reply_at pour sender_id';
