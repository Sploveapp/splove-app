import type { SupabaseClient } from "@supabase/supabase-js";
import { profilePhotoStoragePathFromPublicUrl } from "./profilePhotoStoragePath";

export const PROFILE_PHOTOS_BUCKET = "profile-photos" as const;

/** Default signed URL lifetime (1 hour). */
export const DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC = 300;

const BUCKET_SLASH = `${PROFILE_PHOTOS_BUCKET}/`;

/**
 * Resolves a stored profile photo reference (public-style URL, object path, or `bucket/path`) to
 * the Storage object key used with `createSignedUrl`.
 * Returns `null` when the value is not a `profile-photos` object (e.g. external `https` avatar).
 */
export function profilePhotoObjectPathFromStoredValue(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const s = value.trim();
  if (!s) return null;
  if (s.startsWith("blob:") || s.startsWith("data:")) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    if (s.includes("/object/sign/") && s.includes(BUCKET_SLASH)) {
      return null;
    }
    if (!s.includes(`/${PROFILE_PHOTOS_BUCKET}/`)) {
      return null;
    }
    return profilePhotoStoragePathFromPublicUrl(s);
  }
  if (s.startsWith(BUCKET_SLASH)) {
    return s.slice(BUCKET_SLASH.length) || null;
  }
  return s;
}

/**
 * `true` when the string can be used as an image `src` without signing (blob, data URL,
 * non–profile-photos `https` avatar, or an already-issued object sign URL).
 */
export function shouldPassThroughProfilePhotoDisplayUrl(s: string | null | undefined): boolean {
  if (s == null) return false;
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith("blob:") || t.startsWith("data:")) return true;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    if (t.includes("/object/sign/") && t.includes(BUCKET_SLASH)) return true;
    if (t.includes(`/${PROFILE_PHOTOS_BUCKET}/`)) return false;
    return true;
  }
  return false;
}

/**
 * Returns a time-limited signed URL for a `profile-photos` object, or the original value when
 * it does not refer to that bucket. Returns `null` for missing/empty input or when signing fails.
 */
export async function getProfilePhotoSignedUrl(
  supabase: SupabaseClient,
  raw: string | null | undefined,
  expiresInSec: number = DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
): Promise<string | null> {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (shouldPassThroughProfilePhotoDisplayUrl(s)) return s;
  const objectPath = profilePhotoObjectPathFromStoredValue(s);
  if (!objectPath) return null;
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(objectPath, Math.max(60, expiresInSec));
  if (error || !data?.signedUrl) {
    if (import.meta.env.DEV) {
      console.warn("[getProfilePhotoSignedUrl]", objectPath, error?.message ?? "no signedUrl");
    }
    return null;
  }
  return data.signedUrl;
}

/** Unique stored photo references in a stable order (main → portrait → avatar → full body). */
export function uniqueProfilePhotoRefsOrdered(
  p: {
    main_photo_url?: string | null;
    portrait_url?: string | null;
    avatar_url?: string | null;
    fullbody_url?: string | null;
  } | null | undefined,
): string[] {
  if (p == null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [p.main_photo_url, p.portrait_url, p.avatar_url, p.fullbody_url]) {
    const t = typeof u === "string" ? u.trim() : "";
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
