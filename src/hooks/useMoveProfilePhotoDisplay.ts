import { useCallback, useEffect, useState } from "react";
import {
  ensureMoveProfilePhotoDisplay,
  getMoveProfilePhotoDisplaySync,
  invalidateMoveProfilePhotoDisplay,
  subscribeMoveProfilePhotoDisplay,
} from "../lib/moveProfilePhotoCache";

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
      setDisplaySrc(src);
      setIsPending(false);
      setResolutionFailed(false);
    });

    void ensureMoveProfilePhotoDisplay(ref, {
      profileId: profileId ?? null,
      logSource,
    }).then((src) => {
      if (!src) {
        setResolutionFailed(true);
        setIsPending(false);
      }
    });

    return unsub;
  }, [ref, profileId, logSource]);

  const onImageLoad = useCallback(() => {
    setResolutionFailed(false);
  }, []);

  const onImageError = useCallback(() => {
    if (!ref) return;
    invalidateMoveProfilePhotoDisplay(ref);
    setResolutionFailed(true);
    setIsPending(false);
  }, [ref]);

  return {
    displaySrc,
    isPending,
    resolutionFailed,
    onImageLoad,
    onImageError,
  };
}
