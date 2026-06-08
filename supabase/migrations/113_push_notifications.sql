-- Push natives (APNs / FCM) : présence app + dispatch vers Edge Function send-push-notification.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS active_route text,
  ADD COLUMN IF NOT EXISTS active_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz;

COMMENT ON COLUMN public.device_tokens.active_route IS
  'Dernière route HashRouter (#/likes-you, #/chat/…). Utilisé pour ne pas envoyer de push si l’utilisateur est déjà sur l’écran.';

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_webhook_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  functions_base_url text NOT NULL DEFAULT '',
  webhook_secret text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.push_webhook_settings IS
  'Config one-shot pour pg_net → Edge Function (remplir après déploiement). Ex. functions_base_url = https://xxx.supabase.co';

ALTER TABLE public.push_webhook_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.push_webhook_settings (id, functions_base_url, webhook_secret)
VALUES (1, '', '')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.splove_dispatch_push_notification(
  p_recipient_user_id uuid,
  p_kind text,
  p_route text,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text;
  v_secret text;
  v_body jsonb;
BEGIN
  IF p_recipient_user_id IS NULL OR btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_route, '')) = '' THEN
    RETURN;
  END IF;

  SELECT s.functions_base_url, s.webhook_secret
  INTO v_base_url, v_secret
  FROM public.push_webhook_settings s
  WHERE s.id = 1;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
    RETURN;
  END IF;

  v_body := jsonb_build_object(
    'recipientUserId', p_recipient_user_id,
    'kind', btrim(p_kind),
    'route', btrim(p_route),
    'conversationId', p_conversation_id
  );

  PERFORM net.http_post(
    url := rtrim(v_base_url, '/') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Splove-Push-Secret', v_secret
    ),
    body := v_body
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[splove_dispatch_push_notification] kind=% recipient=% err=%',
      p_kind, p_recipient_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.splove_dispatch_push_notification(uuid, text, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Like → push (in-app inchangé via tr_splove_notify_new_like)
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
  v_to uuid;
  v_reciprocal boolean := false;
  v_name text;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'from_user'
    ) THEN
      v_from := NEW.from_user;
      v_to := NEW.to_user;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.from_user = v_to AND l.to_user = v_from
      ) INTO v_reciprocal;
    ELSE
      v_from := NEW.liker_id;
      v_to := NEW.liked_id;
      SELECT EXISTS (
        SELECT 1 FROM public.likes l
        WHERE l.liker_id = v_to AND l.liked_id = v_from
      ) INTO v_reciprocal;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_to IS NULL OR v_from IS NULL OR v_reciprocal THEN
    RETURN NEW;
  END IF;

  v_name := public.splove_profile_first_name(v_from);

  PERFORM public.splove_upsert_notification(
    v_to,
    'new_like',
    'new_like:' || v_from::text || ':' || NEW.id::text,
    jsonb_build_object(
      'route', '/likes-you',
      'actor_id', v_from,
      'actor_name', v_name
    ),
    true
  );

  PERFORM public.splove_dispatch_push_notification(v_to, 'like', '/likes-you', NULL);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Match → push
CREATE OR REPLACE FUNCTION public.tr_splove_notify_new_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_peer uuid;
  v_name text;
  v_route text;
BEGIN
  SELECT c.id INTO v_cid
  FROM public.conversations c
  WHERE c.match_id = NEW.id
  ORDER BY c.created_at ASC NULLS LAST
  LIMIT 1;

  v_route := CASE
    WHEN v_cid IS NOT NULL THEN '/match/' || v_cid::text
    ELSE '/messages'
  END;

  FOR v_peer IN SELECT unnest(ARRAY[NEW.user_a, NEW.user_b]) LOOP
    IF v_peer IS NULL THEN
      CONTINUE;
    END IF;
    v_name := public.splove_profile_first_name(
      CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END
    );
    PERFORM public.splove_upsert_notification(
      v_peer,
      'new_match',
      'new_match:' || NEW.id::text || ':' || v_peer::text,
      jsonb_build_object(
        'route', v_route,
        'conversation_id', v_cid,
        'match_id', NEW.id,
        'actor_id', CASE WHEN v_peer = NEW.user_a THEN NEW.user_b ELSE NEW.user_a END,
        'actor_name', v_name
      ),
      true
    );

    PERFORM public.splove_dispatch_push_notification(v_peer, 'match', v_route, v_cid);
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Message chat → push uniquement (pas de cloche in-app, cf. migration 107)
CREATE OR REPLACE FUNCTION public.tr_splove_push_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer uuid;
  v_mt text;
  v_route text;
BEGIN
  IF to_regclass('public.messages') IS NULL THEN
    RETURN NEW;
  END IF;

  v_mt := lower(coalesce(NEW.message_type, 'text'));
  IF v_mt IN ('activity_proposal', 'activity_proposal_response') THEN
    RETURN NEW;
  END IF;

  v_peer := public.splove_conversation_peer(NEW.conversation_id, NEW.sender_id);
  IF v_peer IS NULL OR v_peer = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_route := '/chat/' || NEW.conversation_id::text;
  PERFORM public.splove_dispatch_push_notification(v_peer, 'message', v_route, NEW.conversation_id);

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS tr_splove_push_new_message ON public.messages;
    CREATE TRIGGER tr_splove_push_new_message
      AFTER INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.tr_splove_push_new_message();
  END IF;
END;
$$;
