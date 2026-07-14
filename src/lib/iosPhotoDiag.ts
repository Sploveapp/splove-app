import { shouldUseIosCapacitorImageFallback } from "./capacitorImageDataUrl";
import { isPhotoDebugEnabled } from "./photoDebugLog";
import { photoFlowFieldsFromRow } from "./photoFlowLog";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export type IosPhotoDiagEvent =
  | "session_changed"
  | "profile_candidate"
  | "cache_hit"
  | "cache_miss"
  | "cache_invalidated"
  | "signed_url_created"
  | "display_src_ready"
  | "img_onload"
  | "img_onerror"
  | "all_candidates_failed";

export type MoveProfilePhotoRowSnapshot = {
  id?: string | null;
  first_name?: string | null;
  portrait_url?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
  portrait_path?: string | null;
};

const profileRowById = new Map<string, MoveProfilePhotoRowSnapshot>();

let authUserId: string | null = null;

/** UUID Linda test observés lors des audits (comparaison iPhone vs Render). */
export const IOS_PHOTO_DIAG_KNOWN_IDS = {
  viewerCurrentPrefix: "7fcc9bca",
  lindaObservedPrefix: "98197128",
} as const;

export function setIosPhotoDiagAuthUserId(userId: string | null | undefined): void {
  authUserId = typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

export function getIosPhotoDiagAuthUserId(): string | null {
  return authUserId;
}

export function registerMoveProfilePhotoRowForDiag(
  profile: MoveProfilePhotoRowSnapshot | null | undefined,
): void {
  const id = typeof profile?.id === "string" ? profile.id.trim() : "";
  if (!id || !profile) return;
  profileRowById.set(id, {
    id,
    first_name: profile.first_name ?? null,
    portrait_url: profile.portrait_url ?? null,
    main_photo_url: profile.main_photo_url ?? null,
    avatar_url: profile.avatar_url ?? null,
    portrait_path:
      typeof (profile as Record<string, unknown>).portrait_path === "string"
        ? String((profile as Record<string, unknown>).portrait_path)
        : null,
  });
}

export function peekMoveProfilePhotoRowForDiag(
  profileId: string | null | undefined,
): MoveProfilePhotoRowSnapshot | null {
  const id = typeof profileId === "string" ? profileId.trim() : "";
  if (!id) return null;
  return profileRowById.get(id) ?? { id };
}

export function clearMoveProfilePhotoRowDiagRegistry(): void {
  profileRowById.clear();
}

function shouldEmitIosPhotoDiag(logSource?: string | null): boolean {
  if (shouldUseIosCapacitorImageFallback()) return true;
  if (isPhotoDebugEnabled()) return true;
  return Boolean(logSource?.startsWith("discover."));
}

function idPrefix(id: string | null | undefined): string | null {
  if (!id) return null;
  const s = id.trim();
  return s.length >= 8 ? `${s.slice(0, 8)}…` : s;
}

function idMatchHint(profileId: string | null | undefined): Record<string, unknown> {
  const pid = typeof profileId === "string" ? profileId.trim() : "";
  const auth = authUserId ?? "";
  return {
    authUserId: auth || null,
    authUserIdPrefix: idPrefix(auth),
    profileId: pid || null,
    profileIdPrefix: idPrefix(pid),
    profileIsAuthUser: Boolean(pid && auth && pid === auth),
    matchesKnownViewer: auth.startsWith(IOS_PHOTO_DIAG_KNOWN_IDS.viewerCurrentPrefix),
    matchesKnownLindaProfile: pid.startsWith(IOS_PHOTO_DIAG_KNOWN_IDS.lindaObservedPrefix),
  };
}

export function logIosPhotoDiag(
  event: IosPhotoDiagEvent,
  payload: {
    profileId?: string | null;
    logSource?: string | null;
    photoField?: string | null;
    storedRef?: string | null;
    displaySrc?: string | null;
    cacheKey?: string | null;
    cacheState?: Record<string, unknown> | null;
    candidateIndex?: number;
    candidateCount?: number;
    error?: string | null;
    extra?: Record<string, unknown>;
  } = {},
): void {
  if (!shouldEmitIosPhotoDiag(payload.logSource)) return;

  const row = peekMoveProfilePhotoRowForDiag(payload.profileId ?? null);
  const profileRecord = row as Record<string, unknown> | null;

  console.log(`[IOSPhotoDiag] ${event}`, {
    ...idMatchHint(payload.profileId ?? row?.id ?? null),
    first_name: row?.first_name ?? null,
    portrait_url: photoUrlPrefix(row?.portrait_url),
    main_photo_url: photoUrlPrefix(row?.main_photo_url),
    avatar_url: photoUrlPrefix(row?.avatar_url),
    portrait_path: photoUrlPrefix(row?.portrait_path),
    photos: photoFlowFieldsFromRow(profileRecord),
    photoField: payload.photoField ?? null,
    storedRef: photoUrlPrefix(payload.storedRef),
    displaySrc: photoUrlPrefix(payload.displaySrc),
    displaySrcKind:
      typeof payload.displaySrc === "string"
        ? payload.displaySrc.startsWith("data:")
          ? "data_url"
          : payload.displaySrc.startsWith("blob:")
            ? "blob_url"
            : "https"
        : null,
    sourceField: payload.photoField ?? null,
    cacheKey: payload.cacheKey ?? null,
    cacheState: payload.cacheState ?? null,
    candidateIndex: payload.candidateIndex ?? null,
    candidateCount: payload.candidateCount ?? null,
    logSource: payload.logSource ?? null,
    error: payload.error ?? null,
    ...payload.extra,
  });
}
