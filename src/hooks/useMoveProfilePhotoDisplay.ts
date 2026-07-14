import { useCallback, useEffect, useState } from "react";
import {
  describeMoveProfilePhotoCache,
  ensureMoveProfilePhotoDisplay,
  getMoveProfilePhotoDisplaySync,
  invalidateMoveProfilePhotoRefCaches,
  moveProfilePhotoDisplayCacheKey,
  subscribeMoveProfilePhotoDisplay,
} from "../lib/moveProfilePhotoCache";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "../lib/photoIosDebug";
import { logDiscoverProfilePhotoDiag } from "../lib/discoverProfilePhotoDiag";
import { logIosPhotoDiag } from "../lib/iosPhotoDiag";
import {
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "../lib/profilePhotoSignedUrl";

type MovePhotoDisplayState = {
  displaySrc: string | null;
  isPending: boolean;
  resolutionFailed: boolean;
  onImageLoad: () => void;
  onImageError: () => void;
};

/**
 * Affichage photo Move — cache signed URL + data URL iOS, indexé par profile.id.
 */
export function useMoveProfilePhotoDisplay(
  storedRef: string | null | undefined,
  profileId: string | null | undefined,
  logSource: string,
): MovePhotoDisplayState {
  const ref = typeof storedRef === "string" && storedRef.trim() ? storedRef.trim() : null;

  const [displaySrc, setDisplaySrc] = useState<string | null>(() =>
    ref ? getMoveProfilePhotoDisplaySync(ref, profileId, logSource) : null,
  );
  const [isPending, setIsPending] = useState(
    () => Boolean(ref && !getMoveProfilePhotoDisplaySync(ref, profileId, logSource)),
  );
  const [resolutionFailed, setResolutionFailed] = useState(false);

  useEffect(() => {
    if (!ref) {
      setDisplaySrc(null);
      setIsPending(false);
      setResolutionFailed(false);
      return;
    }

    const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, ref);
    const cached = getMoveProfilePhotoDisplaySync(ref, profileId, logSource);
    if (cached) {
      setDisplaySrc(cached);
      setIsPending(false);
      setResolutionFailed(false);
      return;
    }

    setIsPending(true);
    setResolutionFailed(false);

    const unsub = subscribeMoveProfilePhotoDisplay(ref, profileId, (src) => {
      if (!src) return;
      logPhotoIosDebug("final_img_src", {
        screen: logSource,
        profileId: profileId ?? null,
        srcKind: classifyImgSrcForIosDebug(src),
        phase: "cache_notify",
      });
      setDisplaySrc(src);
      setIsPending(false);
      setResolutionFailed(false);
    });

    void ensureMoveProfilePhotoDisplay(ref, {
      profileId: profileId ?? null,
      logSource,
    }).then((src) => {
      if (src) {
        logPhotoIosDebug("final_img_src", {
          screen: logSource,
          profileId: profileId ?? null,
          srcKind: classifyImgSrcForIosDebug(src),
          phase: "ensure_resolved",
        });
      } else {
        logDiscoverProfilePhotoDiag({
          phase: "ensure_display_failed",
          profileId,
          logSource,
          storedRef: ref,
          objectPath: profilePhotoObjectPathFromStoredValue(ref),
          passThrough: shouldPassThroughProfilePhotoDisplayUrl(ref),
          error: "ensureMoveProfilePhotoDisplay_returned_null",
          extra: { cacheKey, cacheState: describeMoveProfilePhotoCache(ref, profileId) },
        });
        setResolutionFailed(true);
        setIsPending(false);
      }
    });

    return unsub;
  }, [ref, profileId, logSource]);

  const onImageLoad = useCallback(() => {
    setResolutionFailed(false);
    logIosPhotoDiag("img_onload", {
      profileId,
      logSource,
      storedRef: ref,
      displaySrc,
      cacheKey: ref ? moveProfilePhotoDisplayCacheKey(profileId, ref) : null,
      cacheState: ref ? describeMoveProfilePhotoCache(ref, profileId) : null,
    });
    logPhotoIosDebug("img_onload", {
      screen: logSource,
      profileId: profileId ?? null,
      srcKind: classifyImgSrcForIosDebug(displaySrc),
    });
  }, [displaySrc, logSource, profileId, ref]);

  const onImageError = useCallback(() => {
    if (!ref) return;
    logIosPhotoDiag("img_onerror", {
      profileId,
      logSource,
      storedRef: ref,
      displaySrc: displaySrc ?? null,
      cacheKey: moveProfilePhotoDisplayCacheKey(profileId, ref),
      cacheState: describeMoveProfilePhotoCache(ref, profileId),
      error: "img_element_onerror",
    });
    logDiscoverProfilePhotoDiag({
      phase: "move_hook_img_onerror",
      profileId,
      logSource,
      storedRef: ref,
      displaySrc: displaySrc ?? null,
      error: "img_element_onerror_after_invalidate",
      extra: { srcKind: classifyImgSrcForIosDebug(displaySrc) },
    });
    logPhotoIosDebug("img_onerror", {
      screen: logSource,
      profileId: profileId ?? null,
      srcKind: classifyImgSrcForIosDebug(displaySrc),
      storedRef: ref.slice(0, 96),
    });
    invalidateMoveProfilePhotoRefCaches(ref, profileId, logSource);
    setDisplaySrc(null);
    setResolutionFailed(true);
    setIsPending(false);
  }, [ref, displaySrc, logSource, profileId]);

  return {
    displaySrc,
    isPending,
    resolutionFailed,
    onImageLoad,
    onImageError,
  };
}
