-- Filet serveur : complète la modération client (messages).
-- Moins riche que le filtre TS ; les utilisateurs voient le même libellé d’erreur côté app.

CREATE OR REPLACE FUNCTION public.enforce_message_body_safety()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b text;
BEGIN
  b := trim(coalesce(NEW.body, ''));
  IF length(b) = 0 THEN
    RETURN NEW;
  END IF;
  IF b ~* '(https?://|www\.)' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  IF b ~* '\m[\w.-]+\.(com|fr|net|io|org|me|gg|ly|co|app|link)\M' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  IF b ~* '(wa\.me|t\.me|discord\.gg|telegram\.me|instagram\.com|tiktok\.com|onlyfans\.com)' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  IF b ~* '(instagram|whatsapp|telegram|snapchat|tiktok|discord|onlyfans)' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  IF b ~* '(escort|prostitution|paypal|virement|western union|venmo|bitcoin|btc)' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  IF b ~ '\d{7,}' THEN
    RAISE EXCEPTION 'SPLove: contenu non autorisé dans les messages.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_messages_body_safety ON public.messages;
    CREATE TRIGGER trg_messages_body_safety
      BEFORE INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_message_body_safety();
  END IF;
  IF to_regclass('public.conversation_messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_conversation_messages_body_safety ON public.conversation_messages;
    CREATE TRIGGER trg_conversation_messages_body_safety
      BEFORE INSERT ON public.conversation_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_message_body_safety();
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_message_body_safety() IS
  'Complément serveur : liens, domaines, réseaux, indices argent/escort, longues suites de chiffres.';
