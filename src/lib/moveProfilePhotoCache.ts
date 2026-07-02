import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { supabase } from "./supabase";
import { buildIosCapacitorImageFetchUrlCandidates } from "./profilePhotoIosDisplayUrls";
import {
  buildProfilePhotoPublicUrl,
  normalizeProfilePhotoStoredRef,
} from "./profilePhotoUpload";
import {
  getProfilePhotoSignedUrl,
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "./profilePhotoSignedUrl";
import { shouldUseIosCapacitorImageFallback } from "./capacitorImageDataUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { pickPortraitFirstProfilePhotoStoredRef, type ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";

const SIGNED_CACHE_TTL_MS = 50 * 60 * 1000;
const SIGNED_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DISPLAY_CACHE_MAX = 48;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_FETCH = 3;

type SignedEntry = { url: string; expiresAt: number };
type DisplayEntry = { src: string; kind: "https" | "blob" };

const signedUrlByRef = new Map<string, SignedEntry>();
const displayByRef = new Map<string, DisplayEntry>();
const inflightSigned = new Map<string, Promise<string | null>>();
const inflightDisplay = new Map<string, Promise<string | null>>();
const displayListeners = new Map<string, Set<(src: string | null) => void>>();

let activeFetches = 0;
const fetchWaitQueue: Array<() => void> = [];

function refKey(storedRef: string): string {
  return normalizeProfilePhotoStoredRef(storedRef, supabase).split("?")[0]?.split("#")[0] ?? storedRef.trim();
}

function isIosNative(): boolean {
  return shouldUseIosCapacitorImageFallback();
}

async function withFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_CONCURRENT_FETCH) {
    await new Promise<void>((resolve) => {
      fetchWaitQueue.push(resolve);
    });
  }
  activeFetches += 1;
  try {
    return await fn();
  } finally {
    activeFetches -= 1;
    fetchWaitQueue.shift()?.();
  }
}

function notifyDisplayListeners(storedRef: string, src: string | null): void {
  const key = refKey(storedRef);
  const set = displayListeners.get(key);
  if (!set) return;
  for (const listener of set) listener(src);
}

function revokeBlobIfNeeded(entry: DisplayEntry | undefined): void {
  if (entry?.kind === "blob" && entry.src.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(entry.src);
    } catch {
      /* ignore */
    }
  }
}

function rememberDisplay(storedRef: string, src: string, kind: DisplayEntry["kind"]): void {
  const key = refKey(storedRef);
  if (displayByRef.size >= DISPLAY_CACHE_MAX && !displayByRef.has(key)) {
    const oldest = displayByRef.keys().next().value;
    if (oldest) {
      revokeBlobIfNeeded(displayByRef.get(oldest));
      displayByRef.delete(oldest);
    }
  }
  const prev = displayByRef.get(key);
  if (prev?.src !== src) revokeBlobIfNeeded(prev);
  displayByRef.set(key, { src, kind });
  notifyDisplayListeners(storedRef, src);
}

/** Lecture synchrone — affichage instantané si déjà en cache Move. */
export function getMoveProfilePhotoDisplaySync(storedRef: string | null | undefined): string | null {
  const trimmed = typeof storedRef === "string" ? storedRef.trim() : "";
  if (!trimmed) return null;
  return displayByRef.get(refKey(trimmed))?.src ?? null;
}

export function subscribeMoveProfilePhotoDisplay(
  storedRef: string,
  listener: (src: string | null) => void,
): () => void {
  const key = refKey(storedRef);
  let set = displayListeners.get(key);
  if (!set) {
    set = new Set();
    displayListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) displayListeners.delete(key);
  };
}

export function invalidateMoveProfilePhotoDisplay(storedRef: string): void {
  const key = refKey(storedRef);
  revokeBlobIfNeeded(displayByRef.get(key));
  displayByRef.delete(key);
}

function readSignedCache(storedRef: string): string | null {
  const entry = signedUrlByRef.get(refKey(storedRef));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() + SIGNED_REFRESH_BUFFER_MS) {
    signedUrlByRef.delete(refKey(storedRef));
    return null;
  }
  return entry.url;
}

function writeSignedCache(storedRef: string, url: string): void {
  signedUrlByRef.set(refKey(storedRef), {
    url,
    expiresAt: Date.now() + SIGNED_CACHE_TTL_MS,
  });
}

/** Une seule signed URL par ref — cache module + déduplication inflight. */
export async function getMoveProfilePhotoSignedUrlCached(
  storedRef: string,
): Promise<string | null> {
  const trimmed = storedRef.trim();
  if (!trimmed) return null;

  const cached = readSignedCache(trimmed);
  if (cached) return cached;

  const key = refKey(trimmed);
  const inflight = inflightSigned.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const normalized = normalizeProfilePhotoStoredRef(trimmed, supabase);
    if (!normalized) return null;
    if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
      writeSignedCache(trimmed, normalized);
      return normalized;
    }

    const objectPath = profilePhotoObjectPathFromStoredValue(normalized);
    if (!objectPath) return null;

    const signed = await getProfilePhotoSignedUrl(supabase, normalized);
    if (signed) writeSignedCache(trimmed, signed);
    return signed;
  })();

  inflightSigned.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightSigned.delete(key);
  }
}

function contentTypeFromHeaders(headers: Record<string, unknown> | undefined): string {
  if (!headers) return "image/jpeg";
  const raw =
    (headers["Content-Type"] as string | undefined) ??
    (headers["content-type"] as string | undefined);
  return (typeof raw === "string" ? raw.split(";")[0]?.trim() : "") || "image/jpeg";
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function blobUrlFromCapacitorBody(data: unknown, mime: string): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("<")) return null;
    if (trimmed.startsWith("data:")) {
      const comma = trimmed.indexOf(",");
      if (comma < 0) return null;
      const bytes = base64ToBytes(trimmed.slice(comma + 1));
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    }
    const bytes = base64ToBytes(trimmed);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  }
  if (data instanceof ArrayBuffer && data.byteLength > 0) {
    return URL.createObjectURL(new Blob([data], { type: mime }));
  }
  if (ArrayBuffer.isView(data) && data.byteLength > 0) {
    const view = data as ArrayBufferView;
    return URL.createObjectURL(
      new Blob([new Uint8Array(view.buffer, view.byteOffset, view.byteLength)], { type: mime }),
    );
  }
  return null;
}

async function fetchIosMovePhotoBlobUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http")) return null;

  try {
    const response = await Promise.race([
      CapacitorHttp.get({ url: trimmed }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("move_photo_fetch_timeout")), FETCH_TIMEOUT_MS);
      }),
    ]);
    const status = response.status ?? 0;
    if (status < 200 || status >= 300) return null;
    const mime = contentTypeFromHeaders(response.headers as Record<string, unknown> | undefined);
    return blobUrlFromCapacitorBody(response.data, mime);
  } catch {
    return null;
  }
}

function buildMoveFetchCandidates(storedRef: string, signedUrl: string | null): string[] {
  const normalized = normalizeProfilePhotoStoredRef(storedRef, supabase);
  const objectPath = profilePhotoObjectPathFromStoredValue(normalized);
  const publicUrl = objectPath ? buildProfilePhotoPublicUrl(supabase, objectPath) : null;
  const fromIosHelper = buildIosCapacitorImageFetchUrlCandidates(storedRef, signedUrl);

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = typeof value === "string" ? value.trim() : "";
    if (!t || !t.startsWith("http") || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(publicUrl);
  push(signedUrl);
  for (const candidate of fromIosHelper) push(candidate);
  return out;
}

/**
 * Résout et met en cache l’URL affichable Move (HTTPS web, blob: iOS).
 * Déduplique les appels parallèles pour la même ref.
 */
export async function ensureMoveProfilePhotoDisplay(
  storedRef: string,
  _options?: { profileId?: string | null; logSource?: string; prefetch?: boolean },
): Promise<string | null> {
  const trimmed = storedRef.trim();
  if (!trimmed) return null;

  const cached = getMoveProfilePhotoDisplaySync(trimmed);
  if (cached) return cached;

  const key = refKey(trimmed);
  const inflight = inflightDisplay.get(key);
  if (inflight) return inflight;

  const promise = withFetchSlot(async () => {
    if (!isIosNative()) {
      const publicCandidates = buildMoveFetchCandidates(trimmed, null);
      const directPublic = publicCandidates[0] ?? null;
      if (directPublic) {
        rememberDisplay(trimmed, directPublic, "https");
        return directPublic;
      }
      const signed = await getMoveProfilePhotoSignedUrlCached(trimmed);
      if (!signed) return null;
      rememberDisplay(trimmed, signed, "https");
      return signed;
    }

    const signed = await getMoveProfilePhotoSignedUrlCached(trimmed);
    const candidates = buildMoveFetchCandidates(trimmed, signed);
    for (const candidate of candidates) {
      const blobUrl = await fetchIosMovePhotoBlobUrl(candidate);
      if (!blobUrl) continue;
      rememberDisplay(trimmed, blobUrl, "blob");
      if (import.meta.env.DEV) {
        console.log("[MovePhoto] display_ready", {
          storedRef: photoUrlPrefix(trimmed),
          fetchedUrl: photoUrlPrefix(candidate),
          prefetch: Boolean(_options?.prefetch),
        });
      }
      return blobUrl;
    }
    notifyDisplayListeners(trimmed, null);
    return null;
  });

  inflightDisplay.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightDisplay.delete(key);
  }
}

/** Précharge les photos portrait des profils Move (pile + cartes suivantes). */
export function prefetchMoveProfilePhotos(
  profiles: Array<{ id?: string | null } & ProfilePhotoUrlFields>,
  options: { start?: number; count?: number } = {},
): void {
  const { start = 0, count = 10 } = options;

  for (const profile of profiles.slice(start, start + count)) {
    const ref = pickPortraitFirstProfilePhotoStoredRef(profile);
    if (!ref) continue;
    if (getMoveProfilePhotoDisplaySync(ref)) continue;
    void ensureMoveProfilePhotoDisplay(ref, {
      profileId: profile.id ?? null,
      prefetch: true,
      logSource: "move.prefetch",
    });
  }
}
