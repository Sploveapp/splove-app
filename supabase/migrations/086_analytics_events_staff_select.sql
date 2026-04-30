-- Lecture agrégée /analytics — emails autorisées = JWT `email` en minuscules.
-- Remplacez le littéral ci-dessous par le même email que dans `src/pages/Analytics.tsx` → ADMIN_EMAILS (comparaison côté app en insensitive).

DROP POLICY IF EXISTS "analytics_events_staff_select" ON public.analytics_events;

CREATE POLICY "analytics_events_staff_select"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (
    lower(coalesce((auth.jwt() ->> 'email'), '')) IN ('ton_email_ici'::text)
  );

COMMENT ON POLICY "analytics_events_staff_select" ON public.analytics_events IS
  'Sync avec ADMIN_EMAILS dans Analytics.tsx (même valeur, minuscules côté JWT).';
