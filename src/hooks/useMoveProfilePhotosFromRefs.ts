import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMoveProfilePhotoDisplay } from "./useMoveProfilePhotoDisplay";
import { mergeStickyPhotoHandlers, useStickyPhotoDisplaySrc } from "../lib/profilePhotoStickyDisplay";
import type { ProfilePhotoUrlFields } from "../lib/profilePhotoDisplayUrl";
import { pickPortraitFirstProfilePhotoStoredRef } from "../lib/profilePhotoDisplayUrl";

const PRIMARY_MOVE_PHOTO_FIELDS = [
  "portrait_url",
  "main_photo_url",
  "avatar_url",
] as const;

/** portrait → main → avatar (pas de fullbody sur les cartes Move). */
export function buildMovePrimaryPhotoRefs(
  profile: ProfilePhotoUrlFields | null | undefined,
): { refs: string[]; fieldByRef: Record<string, string> } {
  const refs: string[] = [];
  const fieldByRef: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of PRIMARY_MOVE_PHOTO_FIELDS) {
    const t = typeof profile?.[key] === "string" ? profile[key]!.trim() : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    refs.push(t);
    fieldByRef[t] = key;
  }
  if (refs.length > 0) return { refs, fieldByRef };
  const fallback = pickPortraitFirstProfilePhotoStoredRef(profile);
  if (fallback) {
    return { refs: [fallback], fieldByRef: { [fallback]: "portrait_url" } };
  }
  return { refs: [], fieldByRef: {} };
}

type MovePhotosDisplayState = {
  photoRaw: string | null;
  photoField: string | null;
  displaySrc: string | null;
  isPending: boolean;
  hasStoredRef: boolean;
  onImageLoad: () => void;
  onImageError: () => void;
};

/**
 * Move : première ref valide portrait → main → avatar, repli une fois par ref en erreur.
 * Ne remplace jamais une photo déjà affichée par null (sticky après onload).
 */
export function useMoveProfilePhotosFromRefs(
  refs: string[],
  fieldByRef: Record<string, string>,
  profileId: string | null | undefined,
  logSource: string,
): MovePhotosDisplayState {
  const refsKey = refs.join("\0");
  const [refIndex, setRefIndex] = useState(0);
  const errorAttemptsRef = useRef(0);

  useEffect(() => {
    setRefIndex(0);
    errorAttemptsRef.current = 0;
  }, [refsKey, profileId]);

  const activeRef = refs[refIndex] ?? null;
  const photo = useMoveProfilePhotoDisplay(activeRef, profileId ?? null, logSource);
  const stickyScope = `${profileId ?? "anon"}:${refsKey}:${refIndex}`;
  const sticky = useStickyPhotoDisplaySrc(photo.displaySrc, stickyScope);

  const onImageError = useCallback(() => {
    if (sticky.imageLoaded && sticky.displaySrc) return;
    if (errorAttemptsRef.current >= 1) {
      photo.onImageError();
      return;
    }
    if (refIndex < refs.length - 1) {
      errorAttemptsRef.current += 1;
      sticky.resetSticky();
      setRefIndex((i) => i + 1);
      return;
    }
    photo.onImageError();
  }, [
    sticky.imageLoaded,
    sticky.displaySrc,
    sticky.resetSticky,
    refIndex,
    refs.length,
    photo.onImageError,
  ]);

  const onImageLoad = useMemo(
    () =>
      mergeStickyPhotoHandlers(sticky, {
        onLoad: photo.onImageLoad,
      }).onLoad,
    [sticky, photo.onImageLoad],
  );

  const showPending =
    !sticky.displaySrc && Boolean(activeRef) && (photo.isPending || !photo.resolutionFailed);

  return {
    photoRaw: activeRef,
    photoField: activeRef ? (fieldByRef[activeRef] ?? null) : null,
    displaySrc: sticky.displaySrc,
    isPending: showPending,
    hasStoredRef: refs.length > 0,
    onImageLoad,
    onImageError,
  };
}
