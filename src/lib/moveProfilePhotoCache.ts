import { supabase } from "./supabase";
import { buildIosCapacitorImageFetchUrlCandidates } from "./profilePhotoIosDisplayUrls";
import { normalizeProfilePhotoStoredRef } from "./profilePhotoUpload";
import { pickPortraitFirstProfilePhotoStoredRef, type ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "./photoIosDebug";
import { logDiscoverProfilePhotoDiag } from "./discoverProfilePhotoDiag";
import {
  getProfilePhotoSignedUrl,
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
  isProfilePhotosPublicStorageUrl,
} from "./profilePhotoSignedUrl";
import {
  fetchCapacitorImageDataUrl,
  shouldUseIosCapacitorImageFallback,
} from "./capacitorImageDataUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

const SIGNED_CACHE_TTL_MS = 50 * 60 * 1000;
const SIGNED_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DISPLAY_CACHE_MAX = 48;
const MAX_CONCURRENT_FETCH = 3;

type SignedEntry = { url: string; expiresAt: number };
type DisplayEntry = { src: string; kind: "https" | "data" | "blob" };

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
  context?: { profileId?: string | null; logSource?: string | null },
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
    if (!objectPath) {
      logDiscoverProfilePhotoDiag({
        phase: "signed_url_no_object_path",
        profileId: context?.profileId ?? null,
        logSource: context?.logSource ?? null,
        storedRef: trimmed,
        error: "profilePhotoObjectPathFromStoredValue_null",
      });
      return null;
    }

    const signed = await getProfilePhotoSignedUrl(supabase, normalized);
    if (signed) writeSignedCache(trimmed, signed);
    if (!signed && !shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
      logDiscoverProfilePhotoDiag({
        phase: "storage_create_signed_url_failed",
        profileId: context?.profileId ?? null,
        logSource: context?.logSource ?? null,
        storedRef: trimmed,
        objectPath,
        error: "createSignedUrl_returned_null",
        extra: {
          bucket: "profile-photos",
          hint: "Vérifier existence fichier Storage, permissions bucket, chemin objectPath",
        },
      });
    }
    return signed;
  })();

  inflightSigned.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightSigned.delete(key);
  }
}

function buildMoveFetchCandidates(storedRef: string, signedUrl: string | null): string[] {
  const fromIosHelper = buildIosCapacitorImageFetchUrlCandidates(storedRef, signedUrl);

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = typeof value === "string" ? value.trim() : "";
    if (!t || !t.startsWith("http") || seen.has(t) || isProfilePhotosPublicStorageUrl(t)) return;
    seen.add(t);
    out.push(t);
  };

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
    const signed = await getMoveProfilePhotoSignedUrlCached(trimmed, {
      profileId: _options?.profileId ?? null,
      logSource: _options?.logSource ?? null,
    });
    const objectPath = profilePhotoObjectPathFromStoredValue(trimmed);
    logDiscoverProfilePhotoDiag({
      phase: "signed_url_ready",
      profileId: _options?.profileId ?? null,
      logSource: _options?.logSource ?? null,
      storedRef: trimmed,
      objectPath,
      displaySrc: signed,
      passThrough: shouldPassThroughProfilePhotoDisplayUrl(trimmed),
      extra: { signedUrlPresent: Boolean(signed) },
    });
    console.log("[PHOTO_DEBUG] signed_url_ready", {
      screen: _options?.logSource ?? "discover",
      profileId: _options?.profileId ?? null,
      storedRef: photoUrlPrefix(trimmed),
      objectPath,
      signedUrlPresent: Boolean(signed),
    });

    if (!isIosNative()) {
      if (signed) {
        rememberDisplay(trimmed, signed, "https");
        return signed;
      }
      logDiscoverProfilePhotoDiag({
        phase: "web_display_unresolved",
        profileId: _options?.profileId ?? null,
        logSource: _options?.logSource ?? null,
        storedRef: trimmed,
        objectPath,
        error: "no_signed_url_web",
      });
      return null;
    }

    const candidates = buildMoveFetchCandidates(trimmed, signed);
    if (candidates.length > 0) {
      const [primary, ...fallbacks] = candidates;
      const dataUrl = await fetchCapacitorImageDataUrl(primary, fallbacks);
      if (dataUrl) {
        rememberDisplay(trimmed, dataUrl, "data");
        logPhotoIosDebug("final_img_src", {
          screen: _options?.logSource ?? "discover",
          profileId: _options?.profileId ?? null,
          srcKind: classifyImgSrcForIosDebug(dataUrl),
          storedRef: photoUrlPrefix(trimmed),
        });
        if (import.meta.env.DEV) {
          console.log("[MovePhoto] display_ready", {
            storedRef: photoUrlPrefix(trimmed),
            fetchedUrl: photoUrlPrefix(primary),
            prefetch: Boolean(_options?.prefetch),
            srcKind: "data_url",
          });
        }
        return dataUrl;
      }
    }
    logDiscoverProfilePhotoDiag({
      phase: "ios_fetch_failed",
      profileId: _options?.profileId ?? null,
      logSource: _options?.logSource ?? null,
      storedRef: trimmed,
      objectPath,
      displaySrc: signed,
      error: "ios_capacitor_fetch_exhausted",
      extra: { candidateCount: candidates.length },
    });
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
