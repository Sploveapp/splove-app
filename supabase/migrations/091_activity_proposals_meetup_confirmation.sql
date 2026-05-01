-- Détails de rendez-vous après acceptation d’une proposition (client : flow court 2 étapes).
-- JSON : { sport, date, time, location, status: "confirmed", confirmed_at, confirmed_by }.

ALTER TABLE public.activity_proposals
  ADD COLUMN IF NOT EXISTS meetup_confirmation jsonb NULL;

COMMENT ON COLUMN public.activity_proposals.meetup_confirmation IS
  'Optionnel : rendez-vous figé après acceptation — sport, date (YYYY-MM-DD), time (HH:mm), location, status, confirmed_at';
