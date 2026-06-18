import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export function logPhotoMainResolve(
  context: string,
  payload: {
    userId?: string | null;
    profileId?: string | null;
    storedRef?: string | null;
    sourceField?: string | null;
    displaySrc?: string | null;
    isLoading?: boolean;
    isFailed?: boolean;
    extra?: Record<string, unknown>;
  },
): void {
  console.log("PHOTO_MAIN_RESOLVE", context, {
    userId: payload.userId ?? null,
    profileId: payload.profileId ?? null,
    storedRef: photoUrlPrefix(payload.storedRef),
    sourceField: payload.sourceField ?? null,
    displaySrc: photoUrlPrefix(payload.displaySrc),
    isLoading: payload.isLoading ?? false,
    isFailed: payload.isFailed ?? false,
    ...payload.extra,
  });
}

export function logPhotoUploadSuccess(payload: {
  userId?: string | null;
  slot?: string | null;
  storedRef?: string | null;
  displayUrl?: string | null;
  objectPath?: string | null;
}): void {
  console.log("PHOTO_UPLOAD_SUCCESS", {
    userId: payload.userId ?? null,
    slot: payload.slot ?? null,
    storedRef: photoUrlPrefix(payload.storedRef),
    displayUrl: photoUrlPrefix(payload.displayUrl),
    objectPath: payload.objectPath ?? null,
  });
}

export function logPhotoProfileSaveSuccess(payload: {
  userId?: string | null;
  source?: string | null;
  storedRef?: string | null;
  sourceField?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  main_photo_url?: string | null;
}): void {
  console.log("PHOTO_PROFILE_SAVE_SUCCESS", {
    userId: payload.userId ?? null,
    source: payload.source ?? null,
    storedRef: photoUrlPrefix(payload.storedRef),
    sourceField: payload.sourceField ?? null,
    portrait_url: photoUrlPrefix(payload.portrait_url),
    fullbody_url: photoUrlPrefix(payload.fullbody_url),
    main_photo_url: photoUrlPrefix(payload.main_photo_url),
  });
}

export function logPhotoPublicProfileResolve(
  context: string,
  payload: {
    profileId?: string | null;
    storedRef?: string | null;
    displaySrc?: string | null;
    isLoading?: boolean;
    isFailed?: boolean;
  },
): void {
  console.log("PHOTO_PUBLIC_PROFILE_RESOLVE", context, {
    profileId: payload.profileId ?? null,
    storedRef: photoUrlPrefix(payload.storedRef),
    displaySrc: photoUrlPrefix(payload.displaySrc),
    isLoading: payload.isLoading ?? false,
    isFailed: payload.isFailed ?? false,
  });
}
