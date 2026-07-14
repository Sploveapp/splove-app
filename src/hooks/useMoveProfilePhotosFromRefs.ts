import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMoveProfilePhotoDisplay } from "./useMoveProfilePhotoDisplay";
import { mergeStickyPhotoHandlers, useStickyPhotoDisplaySrc } from "../lib/profilePhotoStickyDisplay";
import type { ProfilePhotoUrlFields } from "../lib/profilePhotoDisplayUrl";
import { pickPortraitFirstProfilePhotoStoredRef } from "../lib/profilePhotoDisplayUrl";
import { resolvePortraitStoredRefFromRow } from "../lib/onboardingProfilePhotos";
import { supabase } from "../lib/supabase";
import { isKnownBrokenProfilePhotoUrl } from "../lib/profilePhotoStorageHealth";
import {
  logDiscoverProfilePhotoDiag,
  shouldLogDiscoverProfilePhoto,
} from "../lib/discoverProfilePhotoDiag";
import { PhotoFlowLog } from "../lib/photoFlowLog";
import { photoUrlPrefix } from "../lib/profilePhotoPipelineLog";

const PRIMARY_MOVE_PHOTO_FIELDS = [
  "portrait_url",
  "main_photo_url",
  "avatar_url",
] as const;

function trimUsableMovePhotoRef(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t || isKnownBrokenProfilePhotoUrl(t)) return null;
  return t;
}

/** portrait → main → avatar → legacy portrait_path (pas de fullbody sur les cartes Move). */
export function buildMovePrimaryPhotoRefs(
  profile: ProfilePhotoUrlFields | null | undefined,
): { refs: string[]; fieldByRef: Record<string, string> } {
  const refs: string[] = [];
  const fieldByRef: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of PRIMARY_MOVE_PHOTO_FIELDS) {
    const t = trimUsableMovePhotoRef(profile?.[key]);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    refs.push(t);
    fieldByRef[t] = key;
  }
  if (refs.length === 0 && profile && typeof profile === "object") {
    const legacy = trimUsableMovePhotoRef(
      resolvePortraitStoredRefFromRow(profile as Record<string, unknown>, supabase),
    );
    if (legacy && !seen.has(legacy)) {
      refs.push(legacy);
      fieldByRef[legacy] = "portrait_path";
    }
  }
  if (refs.length > 0) return { refs, fieldByRef };
  const fallback = trimUsableMovePhotoRef(pickPortraitFirstProfilePhotoStoredRef(profile));
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
  const resolutionFailoverDoneRef = useRef(false);

  useEffect(() => {
    setRefIndex(0);
    errorAttemptsRef.current = 0;
    resolutionFailoverDoneRef.current = false;
  }, [refsKey, profileId]);

  useEffect(() => {
    if (!shouldLogDiscoverProfilePhoto({ logSource, profile: { id: profileId ?? null } })) return;
    logDiscoverProfilePhotoDiag({
      phase: refs.length > 0 ? "candidates_ready" : "candidates_empty",
      profileId,
      logSource,
      candidateRefs: refs,
      candidateCount: refs.length,
      extra: {
        candidateFields: refs.map((ref) => ({
          field: fieldByRef[ref] ?? null,
          ref: photoUrlPrefix(ref),
        })),
      },
    });
  }, [refsKey, profileId, logSource, refs, fieldByRef]);

  const activeRef = refs[refIndex] ?? null;
  const photo = useMoveProfilePhotoDisplay(activeRef, profileId ?? null, logSource);
  const stickyScope = `${profileId ?? "anon"}:${refsKey}:${refIndex}`;
  const sticky = useStickyPhotoDisplaySrc(photo.displaySrc, stickyScope);

  useEffect(() => {
    if (!activeRef || photo.isPending || photo.displaySrc || !photo.resolutionFailed) {
      return;
    }
    if (refIndex >= refs.length - 1) {
      logDiscoverProfilePhotoDiag({
        phase: "all_candidates_failed",
        profileId,
        logSource,
        storedRef: activeRef,
        photoField: fieldByRef[activeRef] ?? null,
        candidateIndex: refIndex,
        candidateCount: refs.length,
        candidateRefs: refs,
        error: "url_resolution_failed",
      });
      PhotoFlowLog.placeholderShown({
        screen: logSource,
        slot: "primary",
        profileId,
        reason: "url_resolution_failed",
        storedRef: activeRef,
        extra: { candidateIndex: refIndex, candidateCount: refs.length },
      });
      return;
    }
    if (resolutionFailoverDoneRef.current) return;
    resolutionFailoverDoneRef.current = true;
    const nextRef = refs[refIndex + 1] ?? null;
    logDiscoverProfilePhotoDiag({
      phase: "resolution_failed_try_next",
      profileId,
      logSource,
      storedRef: activeRef,
      photoField: fieldByRef[activeRef] ?? null,
      candidateIndex: refIndex,
      candidateCount: refs.length,
      candidateRefs: refs,
      error: "signed_or_ios_fetch_failed",
      extra: { nextRef: photoUrlPrefix(nextRef), nextField: nextRef ? fieldByRef[nextRef] ?? null : null },
    });
    sticky.resetSticky();
    setRefIndex((i) => i + 1);
  }, [
    activeRef,
    fieldByRef,
    logSource,
    photo.displaySrc,
    photo.isPending,
    photo.resolutionFailed,
    profileId,
    logSource,
    fieldByRef,
    refIndex,
    refs,
    sticky.resetSticky,
  ]);

  useEffect(() => {
    resolutionFailoverDoneRef.current = false;
  }, [refIndex, activeRef]);

  useEffect(() => {
    if (!photo.displaySrc || !activeRef) return;
    logDiscoverProfilePhotoDiag({
      phase: "display_src_ready",
      profileId,
      logSource,
      storedRef: activeRef,
      photoField: fieldByRef[activeRef] ?? null,
      displaySrc: photo.displaySrc,
      candidateIndex: refIndex,
      candidateCount: refs.length,
    });
    PhotoFlowLog.discoverPhotoResolved({
      profileId,
      photoField: fieldByRef[activeRef] ?? null,
      storedRef: activeRef,
      displayUrl: photo.displaySrc,
      candidateIndex: refIndex,
      candidateCount: refs.length,
    });
  }, [photo.displaySrc, activeRef, profileId, logSource, fieldByRef, refIndex, refs.length]);

  const onImageError = useCallback(() => {
    if (sticky.imageLoaded && sticky.displaySrc) return;
    logDiscoverProfilePhotoDiag({
      phase: "img_onerror",
      profileId,
      logSource,
      storedRef: activeRef,
      photoField: activeRef ? fieldByRef[activeRef] ?? null : null,
      displaySrc: sticky.displaySrc ?? photo.displaySrc,
      candidateIndex: refIndex,
      candidateCount: refs.length,
      error: "img_element_load_failed",
    });
    if (errorAttemptsRef.current >= 1) {
      photo.onImageError();
      return;
    }
    if (refIndex < refs.length - 1) {
      errorAttemptsRef.current += 1;
      logDiscoverProfilePhotoDiag({
        phase: "img_error_try_next",
        profileId,
        logSource,
        storedRef: activeRef,
        photoField: activeRef ? fieldByRef[activeRef] ?? null : null,
        candidateIndex: refIndex,
        candidateCount: refs.length,
        extra: { nextRef: photoUrlPrefix(refs[refIndex + 1]), nextField: fieldByRef[refs[refIndex + 1]!] ?? null },
      });
      sticky.resetSticky();
      setRefIndex((i) => i + 1);
      return;
    }
    photo.onImageError();
  }, [
    activeRef,
    fieldByRef,
    logSource,
    photo.displaySrc,
    photo.onImageError,
    profileId,
    sticky.displaySrc,
    sticky.imageLoaded,
    sticky.resetSticky,
    refIndex,
    refs,
    refs.length,
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
