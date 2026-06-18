import { useEffect, useMemo } from "react";
import {
  getUserMainPhoto,
  getUserMainPhotoRefCandidates,
  logUserMainPhotoDisplay,
  SPLOVE_PROFILE_PHOTO_FALLBACK_SRC,
} from "../lib/userMainPhoto";
import type { ProfilePhotoUrlFields } from "../lib/profilePhotoDisplayUrl";
import { resolveProfilePhotoUiSrc } from "../lib/profilePhotoDisplayUrl";
import { logPhotoMainResolve } from "../lib/profilePhotoMainLog";
import { useProfilePhotoDisplaySrc } from "./useProfilePhotoDisplaySrc";

type Options = {
  userId?: string | null;
  context: string;
};

/**
 * Photo principale connectée : même source BDD + résolution signed URL que l’écran Profil.
 * `imgSrc` null → afficher {@link SPLOVE_PROFILE_PHOTO_FALLBACK_SRC}.
 */
export function useUserMainPhotoDisplay(
  profile: (ProfilePhotoUrlFields & { id?: string | null }) | null | undefined,
  options: Options,
) {
  const mainPhoto = useMemo(
    () => getUserMainPhoto(profile, options.userId),
    [profile, options.userId],
  );
  const candidates = useMemo(() => getUserMainPhotoRefCandidates(profile), [profile]);

  const photo = useProfilePhotoDisplaySrc(candidates.refs, {
    logContext: {
      userId: options.userId ?? mainPhoto.userId,
      profileId: profile?.id ?? options.userId ?? null,
      source: options.context,
      fieldByRef: candidates.fieldByRef,
    },
  });

  const resolvedSrc = resolveProfilePhotoUiSrc(mainPhoto.storedRef, photo.src);
  const imgSrc =
    photo.isLoading && mainPhoto.storedRef && !resolvedSrc
      ? null
      : resolvedSrc && !photo.isFailed
        ? resolvedSrc
        : null;
  const displaySrc = imgSrc ?? (!photo.isLoading ? SPLOVE_PROFILE_PHOTO_FALLBACK_SRC : null);
  const hasStoredRef = Boolean(mainPhoto.storedRef);

  useEffect(() => {
    logPhotoMainResolve(options.context, {
      userId: mainPhoto.userId,
      profileId: profile?.id ?? options.userId ?? null,
      storedRef: mainPhoto.storedRef,
      sourceField: mainPhoto.sourceField,
      displaySrc: displaySrc,
      isLoading: photo.isLoading,
      isFailed: photo.isFailed,
      extra: { fieldSnapshot: mainPhoto.fieldSnapshot },
    });
    logUserMainPhotoDisplay(options.context, {
      userId: mainPhoto.userId,
      storedRef: mainPhoto.storedRef,
      sourceField: mainPhoto.sourceField,
      displaySrc: displaySrc,
      displaySource: imgSrc ? (photo.src ? "hook_resolved" : "sync_fallback") : "splove_fallback",
      extra: {
        isLoading: photo.isLoading,
        isFailed: photo.isFailed,
        fieldSnapshot: mainPhoto.fieldSnapshot,
      },
    });
  }, [
    options.context,
    mainPhoto.userId,
    mainPhoto.storedRef,
    mainPhoto.sourceField,
    imgSrc,
    photo.isLoading,
    photo.isFailed,
    photo.src,
    displaySrc,
    mainPhoto.fieldSnapshot,
  ]);

  return {
    ...mainPhoto,
    ...photo,
    imgSrc,
    displaySrc,
    hasStoredRef,
    storedRef: mainPhoto.storedRef,
    fallbackSrc: SPLOVE_PROFILE_PHOTO_FALLBACK_SRC,
  };
}
