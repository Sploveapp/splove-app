-- Colonnes utilisées par l’app (iOS) parfois absentes si 041 / 100 / 113 non déployées.
-- Idempotent : safe à ré-appliquer sur prod.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pref_open_to_standard_activity BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pref_open_to_adapted_activity BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_children BOOLEAN;

COMMENT ON COLUMN public.profiles.pref_open_to_adapted_activity IS
  'Ouvert aux profils avec activités adaptées (bool legacy ; voir open_to_adapted_activities).';
COMMENT ON COLUMN public.profiles.has_children IS
  'true=oui, false=non, null=préfère ne pas répondre (onboarding).';

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS active_route text,
  ADD COLUMN IF NOT EXISTS active_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz;

COMMENT ON COLUMN public.device_tokens.active_route IS
  'Dernière route app (#/move, #/chat/…) — évite push inutiles.';
COMMENT ON COLUMN public.device_tokens.active_conversation_id IS
  'Fil de chat actif — pas de push message si l’utilisateur est déjà dessus.';
