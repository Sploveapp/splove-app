import { isPhotoDebugEnabled } from "./photoDebugLog";
import { photoFlowFieldsFromRow } from "./photoFlowLog";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import {
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "./profilePhotoSignedUrl";
import type { ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";

/** Profils Discover à tracer sans activer PHOTO_DEBUG (Linda test, Jacob, Lena, …). */
export function isDiscoverProfilePhotoSpotlight(
  profile: (ProfilePhotoUrlFields & { first_name?: string | null }) | null | undefined,
): boolean {
  const name = typeof profile?.first_name === "string" ? profile.first_name.trim().toLowerCase() : "";
  if (name && /\b(linda|jacob|lena)\b/.test(name)) return true;
  return false;
}

export function shouldLogDiscoverProfilePhoto(
  options?: {
    logSource?: string | null;
    profile?: (ProfilePhotoUrlFields & { first_name?: string | null; id?: string | null }) | null;
  },
): boolean {
  if (isPhotoDebugEnabled()) return true;
  if (options?.logSource?.startsWith("discover.")) return true;
  return isDiscoverProfilePhotoSpotlight(options?.profile);
}

export type DiscoverProfilePhotoDiagPayload = {
  phase: string;
  profile?: (ProfilePhotoUrlFields & { first_name?: string | null; id?: string | null }) | null;
  profileId?: string | null;
  logSource?: string | null;
  photoField?: string | null;
  storedRef?: string | null;
  displaySrc?: string | null;
  candidateIndex?: number;
  candidateCount?: number;
  candidateRefs?: string[] | null;
  objectPath?: string | null;
  passThrough?: boolean;
  error?: string | null;
  extra?: Record<string, unknown>;
};

/** Logs filtrables `[DiscoverPhotoDiag]` — Linda test toujours tracé. */
export function logDiscoverProfilePhotoDiag(payload: DiscoverProfilePhotoDiagPayload): void {
  const profile = payload.profile ?? null;
  const profileId =
    payload.profileId ??
    (typeof profile?.id === "string" ? profile.id : null);

  if (
    !shouldLogDiscoverProfilePhoto({
      logSource: payload.logSource,
      profile: profile ?? { id: profileId },
    })
  ) {
    return;
  }

  const storedRef = payload.storedRef ?? null;
  console.log("[DiscoverPhotoDiag]", payload.phase, {
    profileId,
    first_name: profile?.first_name ?? null,
    logSource: payload.logSource ?? null,
    photoField: payload.photoField ?? null,
    avatar_url: photoUrlPrefix(profile?.avatar_url),
    portrait_url: photoUrlPrefix(profile?.portrait_url),
    main_photo_url: photoUrlPrefix(profile?.main_photo_url),
    fullbody_url: photoUrlPrefix(profile?.fullbody_url),
    photos: photoFlowFieldsFromRow(profile as Record<string, unknown> | null | undefined),
    storedRef: photoUrlPrefix(storedRef),
    objectPath:
      payload.objectPath ??
      (storedRef ? profilePhotoObjectPathFromStoredValue(storedRef) : null),
    passThrough:
      payload.passThrough ??
      (storedRef ? shouldPassThroughProfilePhotoDisplayUrl(storedRef) : null),
    displaySrc: photoUrlPrefix(payload.displaySrc),
    candidateIndex: payload.candidateIndex ?? null,
    candidateCount: payload.candidateCount ?? null,
    candidateRefs: payload.candidateRefs?.map((r) => photoUrlPrefix(r) ?? r) ?? null,
    error: payload.error ?? null,
    ...payload.extra,
  });
}
