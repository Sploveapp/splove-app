import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeCapacitorApp } from "./authRedirect";
import {
  getProfilePhotoSignedUrl,
  profilePhotoObjectPathFromStoredValue,
  PROFILE_PHOTOS_BUCKET,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "./profilePhotoSignedUrl";
import { SPLovePhotoLog } from "./profilePhotoPipelineLog";
import { PhotoFlowLog } from "./photoFlowLog";
import {
  PROFILE_PHOTO_JPEG_EXT,
  PROFILE_PHOTO_JPEG_MIME,
  normalizeProfilePhotoForUpload,
} from "./profilePhotoNormalize";
export type ProfilePhotoSlot = "portrait" | "activity";

export type ProfilePhotoUploadResult = {
  objectPath: string;
  /** URL publique Supabase Storage (référence canonique en BDD). */
  publicUrl: string;
  /** Même valeur que `publicUrl` — jamais un path nu sans schéma. */
  storedRef: string;
  /** URL utilisable dans `<img src>` (signée si bucket privé). */
  displayUrl: string;
  bucketReadableViaPublicUrl: boolean;
};

const LOG = "[profilePhoto]";

export function buildProfilePhotoObjectPath(
  userId: string,
  slot: ProfilePhotoSlot,
  ext: string,
): string {
  const prefix = slot === "portrait" ? "portrait" : "activity";
  return `${userId}/${prefix}_${Date.now()}.${ext}`;
}

export function buildProfilePhotoPublicUrl(
  supabase: SupabaseClient,
  objectPath: string,
): string {
  return supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

/** Référence persistée : URL publique canonique (ou path → URL publique). Signed URL → extrait le path objet. */
export function normalizeProfilePhotoStoredRef(
  value: string | null | undefined,
  supabase?: SupabaseClient,
): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;

  const objectPath = profilePhotoObjectPathFromStoredValue(s);
  if (objectPath) {
    return supabase
      ? buildProfilePhotoPublicUrl(supabase, objectPath)
      : `${PROFILE_PHOTOS_BUCKET}/${objectPath}`;
  }

  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith(`${PROFILE_PHOTOS_BUCKET}/`)) {
    const path = s.slice(`${PROFILE_PHOTOS_BUCKET}/`.length);
    return supabase ? buildProfilePhotoPublicUrl(supabase, path) : s;
  }
  return supabase ? buildProfilePhotoPublicUrl(supabase, s) : s;
}

/** Références photo uniques dans l’ordre main → portrait → fullbody. */
export function primaryProfilePhotoRefs(
  profile: {
    main_photo_url?: string | null;
    portrait_url?: string | null;
    fullbody_url?: string | null;
  } | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [profile?.main_photo_url, profile?.portrait_url, profile?.fullbody_url]) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Photo secondaire : fullbody en priorité, puis portrait / main (sans doublon). */
export function secondaryProfilePhotoRefs(
  profile: {
    main_photo_url?: string | null;
    portrait_url?: string | null;
    fullbody_url?: string | null;
  } | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [profile?.fullbody_url, profile?.portrait_url, profile?.main_photo_url]) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function canReadPublicUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Résout une référence BDD → URLs d’aperçu candidates pour `<img>` (WebView iOS).
 * Ordre : URL publique d’abord (référence canonique BDD), puis signée, puis signée régénérée.
 */
export async function resolveProfilePhotoDisplayCandidates(
  supabase: SupabaseClient,
  storedRef: string | null | undefined,
): Promise<string[]> {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);
  if (!normalized) return [];

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

  push(await getProfilePhotoSignedUrl(supabase, storedRef));
  push(await getProfilePhotoSignedUrl(supabase, storedRef, 3600));
  if (normalized !== String(storedRef ?? "").trim()) {
    push(await getProfilePhotoSignedUrl(supabase, normalized));
  }

  return out;
}

/**
 * Résout une référence BDD → URL d’aperçu (première candidate utilisable).
 */
export async function resolveProfilePhotoDisplayUrl(
  supabase: SupabaseClient,
  storedRef: string | null | undefined,
): Promise<string | null> {
  const candidates = await resolveProfilePhotoDisplayCandidates(supabase, storedRef);
  const first = candidates[0] ?? null;
  if (first) {
    SPLovePhotoLog.displayResolved({
      source: "resolveProfilePhotoDisplayUrl",
      storedRef,
      displayUrl: first,
      extra: { candidateCount: candidates.length },
    });
  } else {
    SPLovePhotoLog.displayFailed({
      source: "resolveProfilePhotoDisplayUrl",
      storedRef,
      error: "no_candidates",
    });
  }
  return first;
}

export async function uploadProfilePhoto(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  slot: ProfilePhotoSlot,
): Promise<ProfilePhotoUploadResult> {
  if (!(file instanceof File)) {
    throw new Error("invalid_file");
  }

  const normalizedFile = await normalizeProfilePhotoForUpload(file);
  const objectPath = buildProfilePhotoObjectPath(userId, slot, PROFILE_PHOTO_JPEG_EXT);

  SPLovePhotoLog.uploadStarted({
    source: "uploadProfilePhoto",
    userId,
    slot,
    objectPath,
    fileSize: normalizedFile.size,
    fileType: normalizedFile.type,
    extra: {
      originalFileSize: file.size,
      originalFileType: file.type || null,
      originalFileName: file.name,
    },
  });
  PhotoFlowLog.onboardingUploadStart({
    userId,
    slot,
    fileSize: normalizedFile.size,
    fileType: normalizedFile.type,
    objectPath,
  });

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(objectPath, normalizedFile, {
      cacheControl: "3600",
      upsert: true,
      contentType: PROFILE_PHOTO_JPEG_MIME,
    });

  if (uploadError) {
    PhotoFlowLog.uploadFailed({
      userId,
      slot,
      error: uploadError.message,
      code: (uploadError as { statusCode?: string }).statusCode ?? null,
      objectPath,
    });
    PhotoFlowLog.uploadResult({
      userId,
      slot,
      ok: false,
      error: uploadError.message,
    });
    SPLovePhotoLog.displayFailed({
      source: "uploadProfilePhoto",
      userId,
      slot,
      objectPath,
      error: uploadError.message,
    });
    console.error(`${LOG} upload_error`, {
      slot,
      objectPath,
      message: uploadError.message,
      code: (uploadError as { statusCode?: string }).statusCode ?? null,
    });
    throw uploadError;
  }

  const publicUrl = buildProfilePhotoPublicUrl(supabase, objectPath);
  const storedRef = publicUrl;

  SPLovePhotoLog.uploadSuccess({
    source: "uploadProfilePhoto",
    userId,
    slot,
    objectPath,
    storedRef,
  });

  PhotoFlowLog.supabaseUrlReturned({
    userId,
    slot,
    storedRef,
    publicUrl,
    displayUrl: null,
    objectPath,
  });

  SPLovePhotoLog.urlGenerated({
    source: "uploadProfilePhoto.publicUrl",
    userId,
    slot,
    objectPath,
    storedRef,
    displayUrl: publicUrl,
  });
  const bucketReadableViaPublicUrl = await canReadPublicUrl(publicUrl);

  let displayUrl: string | null = null;
  if (isNativeCapacitorApp()) {
    displayUrl = await getProfilePhotoSignedUrl(supabase, publicUrl, 3600);
  } else if (bucketReadableViaPublicUrl) {
    displayUrl = publicUrl;
  } else {
    displayUrl = await getProfilePhotoSignedUrl(supabase, publicUrl);
  }

  if (!displayUrl) {
    // Upload Storage réussi : l’aperçu est best-effort (HEAD/CORS WebView). On garde l’URL publique canonique.
    displayUrl = publicUrl;
    SPLovePhotoLog.displayFailed({
      source: "uploadProfilePhoto.preview",
      userId,
      slot,
      objectPath,
      storedRef: publicUrl,
      error: "preview_fallback_public_url",
    });
    console.warn(`${LOG} preview_fallback_public_url`, {
      slot,
      publicUrl,
      uploadPath: uploadData?.path ?? objectPath,
      bucketReadableViaPublicUrl,
    });
  }

  SPLovePhotoLog.urlGenerated({
    source: "uploadProfilePhoto.displayUrl",
    userId,
    slot,
    objectPath,
    storedRef,
    displayUrl,
    extra: { bucketReadableViaPublicUrl },
  });
  PhotoFlowLog.supabaseUrlReturned({
    userId,
    slot,
    storedRef,
    publicUrl,
    displayUrl,
    objectPath,
    bucketReadableViaPublicUrl,
  });
  PhotoFlowLog.onboardingUploadSuccess({
    userId,
    slot,
    storedRef,
    displayUrl,
  });
  PhotoFlowLog.uploadResult({
    userId,
    slot,
    ok: true,
    storedRef,
    displayUrl,
  });

  const facePhotoUrl = slot === "portrait" ? publicUrl : undefined;
  const activityPhotoUrl = slot === "activity" ? publicUrl : undefined;
  console.log(`${LOG} upload_success`, {
    slot,
    objectPath,
    publicUrl,
    facePhotoUrl,
    activityPhotoUrl,
    displayUrlPrefix: displayUrl.slice(0, 72),
    bucketReadableViaPublicUrl,
  });

  return {
    objectPath,
    publicUrl,
    storedRef,
    displayUrl,
    bucketReadableViaPublicUrl,
  };
}
