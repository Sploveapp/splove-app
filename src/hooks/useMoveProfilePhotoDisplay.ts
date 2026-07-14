import { useCallback, useEffect, useState } from "react";
import {
  ensureMoveProfilePhotoDisplay,
  getMoveProfilePhotoDisplaySync,
  invalidateMoveProfilePhotoDisplay,
  subscribeMoveProfilePhotoDisplay,
} from "../lib/moveProfilePhotoCache";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "../lib/photoIosDebug";
import { logDiscoverProfilePhotoDiag } from "../lib/discoverProfilePhotoDiag";
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
 * Affichage photo Move — cache signed URL + blob iOS, prefetch-friendly.
 * Ne régénère pas les URLs à chaque mount si déjà en cache module.
 */
export function useMoveProfilePhotoDisplay(
  storedRef: string | null | undefined,
  profileId: string | null | undefined,
  logSource: string,
): MovePhotoDisplayState {
  const ref = typeof storedRef === "string" && storedRef.trim() ? storedRef.trim() : null;

  const [displaySrc, setDisplaySrc] = useState<string | null>(() =>
    ref ? getMoveProfilePhotoDisplaySync(ref) : null,
  );
  const [isPending, setIsPending] = useState(() => Boolean(ref && !getMoveProfilePhotoDisplaySync(ref)));
  const [resolutionFailed, setResolutionFailed] = useState(false);

  useEffect(() => {
    if (!ref) {
      setDisplaySrc(null);
      setIsPending(false);
      setResolutionFailed(false);
      return;
    }

    const cached = getMoveProfilePhotoDisplaySync(ref);
    if (cached) {
      setDisplaySrc(cached);
      setIsPending(false);
      setResolutionFailed(false);
      return;
    }

    setIsPending(true);
    setResolutionFailed(false);

    const unsub = subscribeMoveProfilePhotoDisplay(ref, (src) => {
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
        });
        setResolutionFailed(true);
        setIsPending(false);
      }
    });

    return unsub;
  }, [ref, profileId, logSource]);

  const onImageLoad = useCallback(() => {
    setResolutionFailed(false);
    logPhotoIosDebug("img_onload", {
      screen: logSource,
      profileId: profileId ?? null,
      srcKind: classifyImgSrcForIosDebug(displaySrc),
    });
  }, [displaySrc, logSource, profileId]);

  const onImageError = useCallback(() => {
    if (!ref) return;
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
    invalidateMoveProfilePhotoDisplay(ref);
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
