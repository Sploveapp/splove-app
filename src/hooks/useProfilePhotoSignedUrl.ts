import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
  getProfilePhotoSignedUrl,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "../lib/profilePhotoSignedUrl";

/**
 * Resolves a stored profile image reference to a `src`-safe URL (signed for `profile-photos`,
 * pass-through for blobs and external `https` avatars). Returns `null` while loading for
 * values that need signing, or when resolution fails.
 */
export function useProfilePhotoSignedUrl(
  raw: string | null | undefined,
  expiresInSec: number = DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (shouldPassThroughProfilePhotoDisplayUrl(s)) return s;
    return null;
  });

  useEffect(() => {
    if (raw == null) {
      setUrl(null);
      return;
    }
    const s = String(raw).trim();
    if (!s) {
      setUrl(null);
      return;
    }
    if (shouldPassThroughProfilePhotoDisplayUrl(s)) {
      setUrl(s);
      return;
    }
    let cancelled = false;
    getProfilePhotoSignedUrl(supabase, s, expiresInSec).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, expiresInSec]);

  return url;
}
