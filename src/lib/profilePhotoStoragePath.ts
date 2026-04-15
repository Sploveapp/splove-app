const BUCKET_SEGMENT = "/profile-photos/";

/** Extrait le chemin Storage (`userId/portrait-….jpg`) depuis l’URL publique du bucket `profile-photos`. */
export function profilePhotoStoragePathFromPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  if (!u) return null;
  const i = u.indexOf(BUCKET_SEGMENT);
  if (i === -1) return null;
  const path = u.slice(i + BUCKET_SEGMENT.length).split("?")[0]?.split("#")[0];
  return path && path.length > 0 ? decodeURIComponent(path) : null;
}
