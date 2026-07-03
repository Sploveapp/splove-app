import { useCallback, useEffect, useRef, useState } from "react";

type StickyPhotoDisplay = {
  /** Src affichée — ne repasse pas à null après un img_onload réussi. */
  displaySrc: string | null;
  imageLoaded: boolean;
  onImageLoad: () => void;
  /** Réinitialise le verrou (changement de ref / scope). */
  resetSticky: () => void;
};

/**
 * Garde d’affichage : une fois l’image chargée avec succès, conserver la src
 * même si le candidat async repasse temporairement à null.
 */
export function useStickyPhotoDisplaySrc(
  candidateSrc: string | null | undefined,
  scopeKey: string,
): StickyPhotoDisplay {
  const scopeRef = useRef(scopeKey);
  const lockedSrcRef = useRef<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    lockedSrcRef.current = null;
    setImageLoaded(false);
  }, [scopeKey]);

  const normalized =
    typeof candidateSrc === "string" && candidateSrc.trim() ? candidateSrc.trim() : null;

  const displaySrc =
    imageLoaded && lockedSrcRef.current ? lockedSrcRef.current : normalized;

  const resetSticky = useCallback(() => {
    lockedSrcRef.current = null;
    setImageLoaded(false);
  }, []);

  const onImageLoad = useCallback(() => {
    const src = normalized ?? lockedSrcRef.current;
    if (!src) return;
    lockedSrcRef.current = src;
    setImageLoaded(true);
  }, [normalized]);

  return {
    displaySrc,
    imageLoaded,
    onImageLoad,
    resetSticky,
  };
}

export function mergeStickyPhotoHandlers(
  sticky: Pick<StickyPhotoDisplay, "onImageLoad" | "imageLoaded">,
  handlers?: { onLoad?: () => void; onError?: () => void },
): { onLoad: () => void; onError: () => void } {
  return {
    onLoad: () => {
      sticky.onImageLoad();
      handlers?.onLoad?.();
    },
    onError: () => {
      if (sticky.imageLoaded) return;
      handlers?.onError?.();
    },
  };
}
