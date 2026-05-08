import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_PROFILE_PHOTO_SIGNED_TTL_SEC,
  getProfilePhotoSignedUrl,
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "../lib/profilePhotoSignedUrl";

const failedRawRefs = new Set<string>();
const failedObjectPaths = new Set<string>();

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
    if (failedRawRefs.has(s)) {
      if (import.meta.env.DEV) {
        console.warn("[Profile active mode debug] retry skipped reason", {
          raw: s,
          reason: "raw previously failed signing",
        });
      }
      setUrl(null);
      return;
    }
    const objectPath = profilePhotoObjectPathFromStoredValue(s);
    if (objectPath && failedObjectPaths.has(objectPath)) {
      if (import.meta.env.DEV) {
        console.warn("[Profile active mode debug] retry skipped reason", {
          raw: s,
          objectPath,
          reason: "object path previously failed signing",
        });
      }
      setUrl(null);
      return;
    }
    let cancelled = false;
    getProfilePhotoSignedUrl(supabase, s, expiresInSec).then((resolved) => {
      if (import.meta.env.DEV) {
        console.log("[Profile active mode debug] signed URL generation result", {
          raw: s,
          objectPath,
          resolved,
        });
      }
      if (!resolved) {
        failedRawRefs.add(s);
        if (objectPath) failedObjectPaths.add(objectPath);
      }
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, expiresInSec]);

  return url;
}
