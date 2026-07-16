import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProfilePhotoPublicUrl,
  normalizeProfilePhotoStoredRef,
} from "./profilePhotoUpload";
import {
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
  isProfilePhotosPublicStorageUrl,
} from "./profilePhotoSignedUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { PhotoFlowLog } from "./photoFlowLog";

/** Bucket `profile-photos` privé — ne jamais utiliser getPublicUrl comme src finale (web + natif). */
export function skipSyncPublicProfilePhotoUrl(storedRef: string | null | undefined): boolean {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);
  if (!normalized) return false;
  if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
    return false;
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

/** Ordre affichage Profil / Move : portrait → main → avatar → fullbody. */
export const PORTRAIT_FIRST_PROFILE_PHOTO_FIELD_ORDER = [
  "portrait_url",
  "main_photo_url",
  "avatar_url",
  "fullbody_url",
] as const;

export type PortraitFirstProfilePhotoField =
  (typeof PORTRAIT_FIRST_PROFILE_PHOTO_FIELD_ORDER)[number];

function trimProfilePhotoStoredRef(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}

/** Candidates uniques portrait → main → avatar → fullbody (même chaîne que Profil / EditProfile). */
export function buildPortraitFirstProfilePhotoRefCandidates(
  profile: ProfilePhotoUrlFields | null | undefined,
): { refs: string[]; fieldByRef: Record<string, PortraitFirstProfilePhotoField> } {
  const refs: string[] = [];
  const fieldByRef: Record<string, PortraitFirstProfilePhotoField> = {};
  const seen = new Set<string>();
  for (const key of PORTRAIT_FIRST_PROFILE_PHOTO_FIELD_ORDER) {
    const ref = trimProfilePhotoStoredRef(profile?.[key]);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    fieldByRef[ref] = key;
  }
  return { refs, fieldByRef };
}

/** Première référence portrait → main → avatar → fullbody. */
export function pickPortraitFirstProfilePhotoStoredRef(
  profile: ProfilePhotoUrlFields | null | undefined,
): string | null {
  return buildPortraitFirstProfilePhotoRefCandidates(profile).refs[0] ?? null;
}

/** Photo principale : portrait → main → avatar (sans fullbody). */
export function pickPrimaryProfilePhotoStoredRef(
  profile: ProfilePhotoUrlFields | null | undefined,
): string | null {
  for (const key of ["portrait_url", "main_photo_url", "avatar_url"] as const) {
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

/** URL HTTP(S) non vide utilisable directement en `<img src>` (sans résolution async). */
export function isHttpOrHttpsPhotoUrl(url: string | null | undefined): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  return t.startsWith("http://") || t.startsWith("https://");
}

/**
 * Photo principale affichable : portrait → main → avatar (URL HTTP(S) complète uniquement).
 * Ne remplace jamais une URL valide par un fallback.
 */
export function pickDirectHttpProfilePhotoUrl(
  profile: ProfilePhotoUrlFields | null | undefined,
): { url: string; field: "portrait_url" | "main_photo_url" | "avatar_url" } | null {
  for (const key of ["portrait_url", "main_photo_url", "avatar_url"] as const) {
    const raw = profile?.[key];
    const t = typeof raw === "string" ? raw.trim() : "";
    if (isHttpOrHttpsPhotoUrl(t)) {
      return { url: t, field: key };
    }
  }
  return null;
}

/** URL publique Storage directe (pas signée, pas avatar OAuth externe). */
export function isDirectPublicProfilePhotoUrl(url: string | null | undefined): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return false;
  if (t.includes("/object/sign/")) return false;
  if (t.includes("/object/public/") && t.includes("/profile-photos/")) return true;
  if (t.startsWith("http://") || t.startsWith("https://")) return false;
  return false;
}

/** `main_photo_url` affichable en `<img src>` sans résolution async (URL publique uniquement). */
export function directMainPhotoUrlFromProfile(
  profile: ProfilePhotoUrlFields | null | undefined,
): string | null {
  const raw = pickPrimaryProfilePhotoStoredRef(profile);
  if (!raw) return null;
  const direct = raw.trim();
  if (isDirectPublicProfilePhotoUrl(direct)) return direct;
  const built = buildSyncProfilePhotoDisplaySrc(raw);
  return built && isDirectPublicProfilePhotoUrl(built) ? built : null;
}

/** Candidates `<img src>` synchrones (public URL / référence http) — sans attendre signed URL. */
export function buildSyncProfilePhotoDisplayCandidates(
  storedRef: string | null | undefined,
  client: SupabaseClient = supabase,
): string[] {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, client);
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
    if (!t || seen.has(t) || isProfilePhotosPublicStorageUrl(t)) return;
    seen.add(t);
    out.push(t);
  };

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    push(normalized.split("?")[0] ?? normalized);
    push(normalized);
  }

  const objectPath = profilePhotoObjectPathFromStoredValue(normalized);
  if (objectPath) {
    push(buildProfilePhotoPublicUrl(client, objectPath));
  }

  return out;
}

export function buildSyncProfilePhotoDisplaySrc(
  storedRef: string | null | undefined,
): string | null {
  return buildSyncProfilePhotoDisplayCandidates(storedRef)[0] ?? null;
}

/** URL finale UI : résolution hook async — conserver une URL HTTP(S) valide déjà connue. */
export function resolveProfilePhotoUiSrc(
  storedRef: string | null | undefined,
  resolvedSrc: string | null | undefined,
): string | null {
  const fromHook = typeof resolvedSrc === "string" ? resolvedSrc.trim() : "";
  if (fromHook && !isProfilePhotosPublicStorageUrl(fromHook)) return fromHook;
  const direct = typeof storedRef === "string" ? storedRef.trim() : "";
  if (isHttpOrHttpsPhotoUrl(direct)) {
    if (fromHook && isProfilePhotosPublicStorageUrl(fromHook)) return fromHook;
    return direct;
  }
  return null;
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
