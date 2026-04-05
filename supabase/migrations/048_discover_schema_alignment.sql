-- Alignement schéma / requête Discover (idempotent, sans casser les flux existants).
-- Discover lit surtout public.profiles (feed_profiles → profiles.*).
-- Colonnes conversations.* : optionnelles, défauts sûrs, pour cohérence si jointures futures.

-- --- profiles (requis par DISCOVER_PROFILES_DETAIL_SELECT côté app) ---
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Si la colonne existait déjà sans défaut, ne pas forcer NOT NULL ici (évite échec sur données vides).
UPDATE public.profiles
SET last_active_at = COALESCE(last_active_at, created_at, NOW())
WHERE last_active_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN last_active_at SET DEFAULT NOW();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activity_proposals_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS messages_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS boost_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_active_at IS 'Découverte / tri — activité app (RPC touch_profile_last_active si présent)';
COMMENT ON COLUMN public.profiles.activity_proposals_count IS 'Découverte — propositions envoyées (dénormalisé)';
COMMENT ON COLUMN public.profiles.last_reply_at IS 'Découverte — dernier message utilisateur';
COMMENT ON COLUMN public.profiles.messages_count IS 'Découverte — volume messages envoyés';
COMMENT ON COLUMN public.profiles.boost_score IS 'Découverte — boost après double retour positif';

-- --- conversations (demandé pour alignement ; Discover ne sélectionne pas cette table aujourd’hui) ---
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS messages_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.conversations.last_reply_at IS 'Optionnel — dernier message sur le fil (non requis par Discover actuel)';
COMMENT ON COLUMN public.conversations.messages_count IS 'Optionnel — nombre de messages sur le fil';
