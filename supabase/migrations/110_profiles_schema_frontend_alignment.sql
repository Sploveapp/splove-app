-- Colonnes utilisées par le frontend mais absentes des COMMENT/ALTER historiques.
-- Référence : docs/SCHEMA_SOURCE_OF_TRUTH.md + npm run schema:check

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sport_practice_type text,
  ADD COLUMN IF NOT EXISTS meet_pref text,
  ADD COLUMN IF NOT EXISTS sport_feeling text,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_privacy_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo2_path text,
  ADD COLUMN IF NOT EXISTS portrait_path text,
  ADD COLUMN IF NOT EXISTS fullbody_path text,
  ADD COLUMN IF NOT EXISTS identity_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS veriff_status text;

COMMENT ON COLUMN public.profiles.first_name IS 'Prénom affiché Discover / chat.';
COMMENT ON COLUMN public.profiles.updated_at IS 'Dernière mise à jour profil (sync onboarding).';
COMMENT ON COLUMN public.profiles.sport_practice_type IS 'Rythme de pratique (Discover scoring).';
COMMENT ON COLUMN public.profiles.meet_pref IS 'Préférence rencontre (onboarding).';
COMMENT ON COLUMN public.profiles.sport_feeling IS 'Ressenti sport (carte Discover).';
COMMENT ON COLUMN public.profiles.accepted_terms_at IS 'Acceptation CGU.';
COMMENT ON COLUMN public.profiles.accepted_privacy_at IS 'Acceptation confidentialité.';
COMMENT ON COLUMN public.profiles.photo2_path IS 'Chemin storage photo 2 (legacy paths).';
COMMENT ON COLUMN public.profiles.portrait_path IS 'Chemin storage portrait (legacy).';
COMMENT ON COLUMN public.profiles.fullbody_path IS 'Chemin storage corps entier (legacy).';
COMMENT ON COLUMN public.profiles.identity_verified IS 'Vérification identité (badge).';
COMMENT ON COLUMN public.profiles.veriff_status IS 'Statut fournisseur Veriff (legacy).';

-- Likes : schéma canonique liker_id / liked_id (remplace from_user / to_user en prod).
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS liker_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS liked_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.likes.liker_id IS 'Utilisateur qui like.';
COMMENT ON COLUMN public.likes.liked_id IS 'Profil liké.';
