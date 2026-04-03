-- =============================================
-- SPLove — Vérification photo (Veriff)
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_photo_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photo_verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS photo_verification_provider TEXT,
  ADD COLUMN IF NOT EXISTS photo_verification_session_id TEXT,
  ADD COLUMN IF NOT EXISTS photo_verification_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.is_photo_verified IS 'Badge « Profil vérifié » affiché si true';
COMMENT ON COLUMN public.profiles.photo_verification_status IS 'approved | rejected | review | pending';
COMMENT ON COLUMN public.profiles.photo_verification_provider IS 'Ex: veriff';
COMMENT ON COLUMN public.profiles.photo_verification_session_id IS 'ID session Veriff — pour lier le webhook au profil';
COMMENT ON COLUMN public.profiles.photo_verification_updated_at IS 'Dernière mise à jour du statut (webhook)';

CREATE INDEX IF NOT EXISTS idx_profiles_photo_verification_session_id
  ON public.profiles (photo_verification_session_id)
  WHERE photo_verification_session_id IS NOT NULL;
