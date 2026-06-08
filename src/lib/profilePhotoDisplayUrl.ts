import { supabase } from "./supabase";
import { isNativeCapacitorApp } from "./authRedirect";
import {
  buildProfilePhotoPublicUrl,
  normalizeProfilePhotoStoredRef,
} from "./profilePhotoUpload";
import {
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "./profilePhotoSignedUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { PhotoFlowLog } from "./photoFlowLog";

/** Sur iOS/Android, les URL publiques Storage échouent souvent en `<img>` WKWebView — on préfère signées. */
export function skipSyncPublicProfilePhotoUrl(storedRef: string | null | undefined): boolean {
  if (!isNativeCapacitorApp()) return false;
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);
  if (!normalized) return false;
  if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
    return !normalized.includes("/profile-photos/");
  }
  return profilePhotoObjectPathFromStoredValue(normalized) != null;
}

export type ProfilePhotoUrlFields = {
  id?: string | null;
  main_photo_url?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  fullbody_url?: string | null;
  face_photo_present?: boolean | null;
  activity_photo_present?: boolean | null;
  photo_status?: string | null;
  photo1_status?: string | null;
  photo2_status?: string | null;
  photo_moderation_overall?: string | null;
};

/** Photo principale : main → portrait → avatar (sans fullbody). */
export function pickPrimaryProfilePhotoStoredRef(
  profile: ProfilePhotoUrlFields | null | undefined,
): string | null {
  for (const key of ["main_photo_url", "portrait_url", "avatar_url"] as const) {
    const t = typeof profile?.[key] === "string" ? profile[key]!.trim() : "";
    if (t) return t;
  }
  return null;
}

/** Photo secondaire : fullbody uniquement. */
export function pickSecondaryProfilePhotoStoredRef(
  profile: ProfilePhotoUrlFields | null | undefined,
): string | null {
  const t = typeof profile?.fullbody_url === "string" ? profile.fullbody_url.trim() : "";
  return t || null;
}

/** Candidates `<img src>` synchrones (public URL / référence http) — sans attendre signed URL. */
export function buildSyncProfilePhotoDisplayCandidates(
  storedRef: string | null | undefined,
): string[] {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);
  if (!normalized) return [];

  if (skipSyncPublicProfilePhotoUrl(storedRef)) {
    return [];
  }

  if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
    return [normalized];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    const t = typeof url === "string" ? url.trim() : "";
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    push(normalized.split("?")[0] ?? normalized);
    push(normalized);
  }

  const objectPath = profilePhotoObjectPathFromStoredValue(normalized);
  if (objectPath) {
    push(buildProfilePhotoPublicUrl(supabase, objectPath));
  }

  return out;
}

export function buildSyncProfilePhotoDisplaySrc(
  storedRef: string | null | undefined,
): string | null {
  return buildSyncProfilePhotoDisplayCandidates(storedRef)[0] ?? null;
}

/** URL finale UI : résolution hook async, sinon fallback synchrone sur la référence BDD. */
export function resolveProfilePhotoUiSrc(
  storedRef: string | null | undefined,
  resolvedSrc: string | null | undefined,
): string | null {
  const fromHook = typeof resolvedSrc === "string" ? resolvedSrc.trim() : "";
  if (fromHook) return fromHook;
  return buildSyncProfilePhotoDisplaySrc(storedRef);
}

/** Log temporaire décision d’affichage (Profil / EditProfile / Discover). */
export function logProfilePhotoUiDecision(
  context: string,
  profile: ProfilePhotoUrlFields | null | undefined,
  displaySrc: string | null,
  slot: "primary" | "secondary" = "primary",
): void {
  const row = profile as Record<string, unknown> | null | undefined;
  const facePresent = row?.face_photo_present;
  const activityPresent = row?.activity_photo_present;
  PhotoFlowLog.uiPhotoDecision({
    context,
    slot,
    profileId: profile?.id ?? null,
    main_photo_url: profile?.main_photo_url ?? null,
    portrait_url: profile?.portrait_url ?? null,
    avatar_url: profile?.avatar_url ?? null,
    fullbody_url: profile?.fullbody_url ?? null,
    face_photo_present: typeof facePresent === "boolean" ? facePresent : null,
    activity_photo_present: typeof activityPresent === "boolean" ? activityPresent : null,
    photo_status: profile?.photo_status ?? null,
    photo1_status: profile?.photo1_status ?? null,
    photo2_status: profile?.photo2_status ?? null,
    photo_moderation_overall: profile?.photo_moderation_overall ?? null,
    displaySrc: photoUrlPrefix(displaySrc),
  });
}
