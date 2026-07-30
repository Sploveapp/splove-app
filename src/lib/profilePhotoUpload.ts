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
import { uploadProfilePhotoJpegViaCapacitorHttp } from "./profilePhotoCapacitorUpload";
import {
  assertProfilePhotoUploadVerified,
  verifyUploadedProfilePhotoPublicUrl,
} from "./profilePhotoUploadVerify";
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
const PROFILE_PHOTO_PNG_MIME = "image/png" as const;

/**
 * MIME Storage explicite — jamais `application/octet-stream`.
 * Priorité : type Blob/File réel → extension (.png) → JPEG par défaut.
 */
export function resolveProfilePhotoUploadContentType(
  blob: { type?: string; name?: string } | null | undefined,
  objectPath?: string | null,
): typeof PROFILE_PHOTO_JPEG_MIME | typeof PROFILE_PHOTO_PNG_MIME {
  const blobType = typeof blob?.type === "string" ? blob.type.trim().toLowerCase() : "";
  if (blobType === "image/png") return PROFILE_PHOTO_PNG_MIME;
  if (blobType === "image/jpeg" || blobType === "image/jpg") return PROFILE_PHOTO_JPEG_MIME;

  const name = typeof blob?.name === "string" ? blob.name : "";
  const path = typeof objectPath === "string" ? objectPath : "";
  const extSource = `${name}\n${path}`.toLowerCase();
  if (/\.png(?:$|[?#])/.test(extSource)) return PROFILE_PHOTO_PNG_MIME;
  return PROFILE_PHOTO_JPEG_MIME;
}

function extensionFromObjectPath(objectPath: string): string {
  const m = objectPath.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/);
  return m?.[1] ?? PROFILE_PHOTO_JPEG_EXT;
}

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
 * Si une URL HTTP(S) complète existe et que la signature échoue, elle reste candidate.
 */
export async function resolveProfilePhotoDisplayCandidates(
  supabase: SupabaseClient,
  storedRef: string | null | undefined,
): Promise<string[]> {
  const raw = typeof storedRef === "string" ? storedRef.trim() : "";
  if (!raw) return [];

  const normalized = normalizeProfilePhotoStoredRef(raw, supabase);
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

  push(await getProfilePhotoSignedUrl(supabase, raw));
  push(await getProfilePhotoSignedUrl(supabase, raw, 3600));
  if (normalized !== raw) {
    push(await getProfilePhotoSignedUrl(supabase, normalized));
  }

  // URL HTTP(S) déjà en BDD : ne jamais aboutir à aucune candidate si le signing échoue.
  if (out.length === 0 && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    push(raw);
  }

  return out;
}

export type ResolveProfilePhotoDisplayOptions = {
  userId?: string | null;
  slot?: "portrait" | "activity" | null;
};

/**
 * Résout une référence BDD → URL d’aperçu (première candidate utilisable).
 */
export async function resolveProfilePhotoDisplayUrl(
  supabase: SupabaseClient,
  storedRef: string | null | undefined,
  options?: ResolveProfilePhotoDisplayOptions,
): Promise<string | null> {
  const raw = typeof storedRef === "string" ? storedRef.trim() : "";
  const hasDirectUrl = raw.startsWith("http://") || raw.startsWith("https://");
  const hasUserId = Boolean(options?.userId?.trim());
  const slot = options?.slot ?? null;

  console.log("[PROFILE_PHOTO_FIX] resolver_input", {
    hasUserId,
    slot,
    hasStoredRef: Boolean(raw),
    hasDirectUrl,
  });

  if (!raw) {
    return null;
  }

  if (hasDirectUrl) {
    console.log("[PROFILE_PHOTO_FIX] direct_url_used", { field: "stored_ref" });
    // Prefer signed when available, but never drop a valid HTTPS URL.
    const candidates = await resolveProfilePhotoDisplayCandidates(supabase, raw);
    const first = candidates[0] ?? raw;
    console.log("[PROFILE_PHOTO_FIX] preview_ready", {
      sourceKind: first === raw ? "direct_https" : "signed_url",
    });
    SPLovePhotoLog.displayResolved({
      source: "resolveProfilePhotoDisplayUrl",
      userId: options?.userId ?? null,
      slot: slot ?? undefined,
      storedRef: raw,
      displayUrl: first,
      extra: { candidateCount: candidates.length, directHttps: true },
    });
    return first;
  }

  const candidates = await resolveProfilePhotoDisplayCandidates(supabase, raw);
  const first = candidates[0] ?? null;
  if (first) {
    console.log("[PROFILE_PHOTO_FIX] preview_ready", { sourceKind: "resolved" });
    SPLovePhotoLog.displayResolved({
      source: "resolveProfilePhotoDisplayUrl",
      userId: options?.userId ?? null,
      slot: slot ?? undefined,
      storedRef: raw,
      displayUrl: first,
      extra: { candidateCount: candidates.length },
    });
  } else {
    SPLovePhotoLog.displayFailed({
      source: "resolveProfilePhotoDisplayUrl",
      userId: options?.userId ?? null,
      slot: slot ?? undefined,
      storedRef: raw,
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
  options?: { replaceObjectPath?: string | null },
): Promise<ProfilePhotoUploadResult> {
  if (!(file instanceof File)) {
    throw new Error("invalid_file");
  }

  // Toujours re-encoder en JPEG (HEIC/PNG → JPEG) avec MIME explicite.
  const normalizedFile = await normalizeProfilePhotoForUpload(file);
  const replacePath =
    typeof options?.replaceObjectPath === "string" ? options.replaceObjectPath.trim() : "";
  const objectPath =
    replacePath && replacePath.startsWith(`${userId}/`)
      ? replacePath.replace(/\.[a-z0-9]+$/i, `.${PROFILE_PHOTO_JPEG_EXT}`)
      : buildProfilePhotoObjectPath(userId, slot, PROFILE_PHOTO_JPEG_EXT);

  const resolvedMimeType = PROFILE_PHOTO_JPEG_MIME;
  // Bytes JPEG bruts + Blob typé — transmis tel quel (pas de re-wrap ArrayBuffer sans MIME).
  const jpegBytes = await normalizedFile.arrayBuffer();
  const jpegBlob = new Blob([jpegBytes], { type: PROFILE_PHOTO_JPEG_MIME });

  console.log("[PROFILE_PHOTO_UPLOAD_MIME]", {
    objectPath,
    blobType: jpegBlob.type || null,
    resolvedMimeType,
    extension: extensionFromObjectPath(objectPath),
  });

  SPLovePhotoLog.uploadStarted({
    source: "uploadProfilePhoto",
    userId,
    slot,
    objectPath,
    fileSize: jpegBlob.size,
    fileType: resolvedMimeType,
    extra: {
      originalFileSize: file.size,
      originalFileType: file.type || null,
      originalFileName: file.name,
      blobType: jpegBlob.type || null,
      resolvedMimeType,
      replaceObjectPath: Boolean(replacePath),
    },
  });
  PhotoFlowLog.onboardingUploadStart({
    userId,
    slot,
    fileSize: jpegBlob.size,
    fileType: resolvedMimeType,
    objectPath,
  });

  /**
   * iOS/Android : `supabase.storage.upload` passe par `capacitorFetch`, qui stringify
   * Blob/File et peut enregistrer l’objet en `application/octet-stream`.
   * Upload natif CapacitorHttp avec Content-Type: image/jpeg + dataType file.
   */
  const useNativeCapacitorUpload = isNativeCapacitorApp();
  let uploadDataPath: string | null = objectPath;

  if (useNativeCapacitorUpload) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken?.trim()) {
      throw new Error("auth_session_required");
    }

    console.log("[PROFILE_PHOTO_UPLOAD_REQUEST_AUDIT]", {
      transport: "capacitor_http",
      method: "POST",
      objectPathEndsWithJpg: objectPath.toLowerCase().endsWith(".jpg"),
      bodyKind: "base64_file",
      blobType: jpegBlob.type || null,
      contentTypeHeader: PROFILE_PHOTO_JPEG_MIME,
      upsertHeaderPresent: true,
    });

    try {
      await uploadProfilePhotoJpegViaCapacitorHttp(
        accessToken,
        objectPath,
        jpegBytes,
        PROFILE_PHOTO_JPEG_MIME,
      );
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
      PhotoFlowLog.uploadFailed({
        userId,
        slot,
        error: message,
        code: null,
        objectPath,
      });
      PhotoFlowLog.uploadResult({
        userId,
        slot,
        ok: false,
        error: message,
      });
      SPLovePhotoLog.displayFailed({
        source: "uploadProfilePhoto",
        userId,
        slot,
        objectPath,
        error: message,
      });
      console.error(`${LOG} upload_error`, {
        slot,
        objectPath,
        message,
        transport: "capacitor_http",
      });
      throw uploadError;
    }
  } else {
    console.log("[PROFILE_PHOTO_UPLOAD_REQUEST_AUDIT]", {
      transport: "supabase_storage_upload",
      method: "POST",
      objectPathEndsWithJpg: objectPath.toLowerCase().endsWith(".jpg"),
      bodyKind: "blob",
      blobType: jpegBlob.type || null,
      contentTypeHeader: PROFILE_PHOTO_JPEG_MIME,
      upsertHeaderPresent: true,
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(objectPath, jpegBlob, {
        upsert: true,
        contentType: PROFILE_PHOTO_JPEG_MIME,
        cacheControl: "3600",
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
        transport: "supabase_storage_upload",
      });
      throw uploadError;
    }
    uploadDataPath = uploadData?.path ?? objectPath;
  }

  const publicUrl = buildProfilePhotoPublicUrl(supabase, objectPath);
  // Bust WKWebView / CDN quand on écrase le même objectPath avec un nouveau MIME.
  const storedRef = `${publicUrl.split("?")[0]}?v=${Date.now()}`;

  const serverVerify = await verifyUploadedProfilePhotoPublicUrl(publicUrl);
  const serverContentType = serverVerify.contentType;
  const serverContentTypeIsJpeg =
    typeof serverContentType === "string" &&
    serverContentType.split(";")[0]?.trim().toLowerCase() === PROFILE_PHOTO_JPEG_MIME;
  console.log("[PROFILE_PHOTO_UPLOAD_SERVER_VERIFY]", {
    status: serverVerify.httpStatus,
    ok: serverVerify.ok,
    serverContentType,
    serverContentTypeIsJpeg,
  });
  if (!serverContentTypeIsJpeg) {
    // assert removes the broken object and throws BAD_CONTENT_TYPE / HEAD_FAILED.
    await assertProfilePhotoUploadVerified(supabase, objectPath, publicUrl);
  }

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
      uploadPath: uploadDataPath ?? objectPath,
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
