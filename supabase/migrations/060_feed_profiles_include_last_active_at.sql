-- Preserve the current feed_profiles logic exactly, only append last_active_at.
DO $$
DECLARE
  current_view_def text;
BEGIN
  SELECT pg_get_viewdef('public.feed_profiles'::regclass, true)
    INTO current_view_def;

  IF current_view_def ILIKE '%last_active_at%' THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.feed_profiles WITH (security_invoker = true) AS
     SELECT fp_base.*, p.last_active_at
     FROM (%s) AS fp_base
     JOIN public.profiles p ON p.id = fp_base.id',
    current_view_def
  );
END
$$;
