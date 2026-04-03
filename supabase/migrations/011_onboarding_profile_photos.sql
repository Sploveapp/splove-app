-- Photos onboarding : portrait + silhouette / en pied

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS main_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS fullbody_url TEXT;

COMMENT ON COLUMN public.profiles.main_photo_url IS 'Photo portrait principale (Discover, cartes)';
COMMENT ON COLUMN public.profiles.fullbody_url IS 'Photo en pied / silhouette (onboarding obligatoire)';

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_photos_public_read" ON storage.objects;
CREATE POLICY "profile_photos_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile_photos_insert_own" ON storage.objects;
CREATE POLICY "profile_photos_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
