-- Phase 1 centre de notifications : pas de notif cloche par message chat (onglet Messages uniquement).

DROP TRIGGER IF EXISTS tr_splove_notify_new_message ON public.messages;

-- Marquer toutes les notifications in-app comme lues (ouverture écran cloche).
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
    AND n.read = false;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_in_app_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_in_app_notifications_read() TO authenticated;

COMMENT ON FUNCTION public.mark_all_in_app_notifications_read() IS
  'Marque toutes les notifications in-app de l’utilisateur courant comme lues (centre cloche).';

-- Badge cloche : exclure les messages chat (Phase 1).
CREATE OR REPLACE FUNCTION public.pulse_my_in_app_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unread int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM public.process_in_app_notification_jobs_for(v_uid);

  SELECT COUNT(*)::int INTO v_unread
    FROM public.in_app_notifications n
   WHERE n.user_id = v_uid
     AND n.read = false
     AND n.kind IS DISTINCT FROM 'new_message';

  RETURN v_unread;
END;
$$;

-- Enrichit le payload avec photo portrait pour l’avatar UI.
CREATE OR REPLACE FUNCTION public.splove_notification_actor_payload(p_actor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'actor_id', p_actor_id,
    'actor_name', public.splove_profile_first_name(p_actor_id),
    'actor_avatar', COALESCE(
      NULLIF(TRIM(p.main_photo_url), ''),
      NULLIF(TRIM(p.portrait_url), ''),
      NULLIF(TRIM(p.avatar_url), ''),
      ''
    )
  )
  FROM public.profiles p
  WHERE p.id = p_actor_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.splove_notification_actor_payload(uuid) FROM PUBLIC;
