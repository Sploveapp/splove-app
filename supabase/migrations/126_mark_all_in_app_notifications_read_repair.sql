-- Repair optionnel (SQL Editor Supabase) — triggers cloche in-app.
-- Ne pas appliquer via `supabase db push` tant que l’historique remote n’est pas aligné.
-- Le client sync via RPC `splove_upsert_notification` même sans ces triggers.

CREATE OR REPLACE FUNCTION public.mark_all_in_app_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.in_app_notifications n
  SET read = true
  WHERE n.user_id = auth.uid()
    AND n.read = false
    AND n.kind IN (
      'new_like', 'play_sent', 'new_match', 'new_message',
      'activity_proposed', 'activity_accepted', 'activity_counter', 'meetup_confirmed'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_in_app_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_in_app_notifications_read() TO authenticated;
