import { supabase } from "./supabase";
import { buildIosCapacitorImageFetchUrlCandidates } from "./profilePhotoIosDisplayUrls";
import { normalizeProfilePhotoStoredRef } from "./profilePhotoUpload";
import { pickPortraitFirstProfilePhotoStoredRef, type ProfilePhotoUrlFields } from "./profilePhotoDisplayUrl";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "./photoIosDebug";
import { logDiscoverProfilePhotoDiag } from "./discoverProfilePhotoDiag";
import { logIosPhotoDiag } from "./iosPhotoDiag";
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
/** Blocage court après échec iOS — pas de cache d'échec permanent. */
const SIGNED_FAILURE_BACKOFF_MS = 4_000;
const DISPLAY_CACHE_MAX = 64;
const MAX_CONCURRENT_FETCH = 3;

type SignedEntry = { url: string; expiresAt: number };
type DisplayEntry = { src: string; kind: "https" | "data" | "blob"; profileId: string };

const signedUrlByRef = new Map<string, SignedEntry>();
const signedFailureUntilByRef = new Map<string, number>();
const displayByKey = new Map<string, DisplayEntry>();
const inflightSigned = new Map<string, Promise<string | null>>();
const inflightDisplay = new Map<string, Promise<string | null>>();
const displayListeners = new Map<string, Set<(src: string | null) => void>>();

let activeFetches = 0;
const fetchWaitQueue: Array<() => void> = [];

export function refKeyFromStoredRef(storedRef: string): string {
  return (
    normalizeProfilePhotoStoredRef(storedRef, supabase).split("?")[0]?.split("#")[0] ??
    storedRef.trim()
  );
}

function normalizeProfileId(profileId: string | null | undefined): string {
  const id = typeof profileId === "string" ? profileId.trim() : "";
  if (!id) return "unknown-profile";
  return id;
}

/** Clé display strictement liée au profil affiché — jamais par prénom / position feed / viewer. */
export function moveProfilePhotoDisplayCacheKey(
  profileId: string | null | undefined,
  storedRef: string,
): string {
  return `${normalizeProfileId(profileId)}|${refKeyFromStoredRef(storedRef)}`;
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

function notifyDisplayListeners(cacheKey: string, src: string | null): void {
  const set = displayListeners.get(cacheKey);
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

function rememberDisplay(
  profileId: string | null | undefined,
  storedRef: string,
  src: string,
  kind: DisplayEntry["kind"],
  logSource?: string | null,
): void {
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, storedRef);
  const pid = normalizeProfileId(profileId);
  if (displayByKey.size >= DISPLAY_CACHE_MAX && !displayByKey.has(cacheKey)) {
    const oldest = displayByKey.keys().next().value;
    if (oldest) {
      revokeBlobIfNeeded(displayByKey.get(oldest));
      displayByKey.delete(oldest);
    }
  }
  const prev = displayByKey.get(cacheKey);
  if (prev?.src !== src) revokeBlobIfNeeded(prev);
  displayByKey.set(cacheKey, { src, kind, profileId: pid });
  notifyDisplayListeners(cacheKey, src);
  logIosPhotoDiag("display_src_ready", {
    profileId,
    logSource,
    storedRef,
    displaySrc: src,
    cacheKey,
    cacheState: describeMoveProfilePhotoCache(storedRef, profileId),
    extra: { kind },
  });
}

export function describeMoveProfilePhotoCache(
  storedRef?: string | null,
  profileId?: string | null,
): Record<string, unknown> {
  const refK = storedRef ? refKeyFromStoredRef(storedRef) : null;
  const displayKey =
    storedRef && profileId ? moveProfilePhotoDisplayCacheKey(profileId, storedRef) : null;
  return {
    displayEntries: displayByKey.size,
    signedEntries: signedUrlByRef.size,
    signedFailureBackoffEntries: signedFailureUntilByRef.size,
    inflightSigned: inflightSigned.size,
    inflightDisplay: inflightDisplay.size,
    refKey: refK,
    displayCacheKey: displayKey,
    displayHit: displayKey ? displayByKey.has(displayKey) : null,
    signedHit: refK ? signedUrlByRef.has(refK) : null,
  };
}

/** Lecture synchrone — affichage instantané si déjà en cache Move pour ce profile.id. */
export function getMoveProfilePhotoDisplaySync(
  storedRef: string | null | undefined,
  profileId?: string | null,
  logSource?: string | null,
): string | null {
  const trimmed = typeof storedRef === "string" ? storedRef.trim() : "";
  if (!trimmed) return null;
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, trimmed);
  const hit = displayByKey.get(cacheKey)?.src ?? null;
  logIosPhotoDiag(hit ? "cache_hit" : "cache_miss", {
    profileId,
    logSource,
    storedRef: trimmed,
    displaySrc: hit,
    cacheKey,
    cacheState: describeMoveProfilePhotoCache(trimmed, profileId),
  });
  return hit;
}

export function subscribeMoveProfilePhotoDisplay(
  storedRef: string,
  profileId: string | null | undefined,
  listener: (src: string | null) => void,
): () => void {
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, storedRef);
  let set = displayListeners.get(cacheKey);
  if (!set) {
    set = new Set();
    displayListeners.set(cacheKey, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) displayListeners.delete(cacheKey);
  };
}

export function invalidateMoveProfilePhotoDisplay(
  storedRef: string,
  profileId?: string | null,
  logSource?: string | null,
): void {
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, storedRef);
  revokeBlobIfNeeded(displayByKey.get(cacheKey));
  displayByKey.delete(cacheKey);
  logIosPhotoDiag("cache_invalidated", {
    profileId,
    logSource,
    storedRef,
    cacheKey,
    cacheState: describeMoveProfilePhotoCache(storedRef, profileId),
    extra: { layer: "display" },
  });
}

export function invalidateMoveProfilePhotoSignedUrl(
  storedRef: string,
  profileId?: string | null,
  logSource?: string | null,
): void {
  const key = refKeyFromStoredRef(storedRef);
  signedUrlByRef.delete(key);
  signedFailureUntilByRef.delete(key);
  inflightSigned.delete(key);
  logIosPhotoDiag("cache_invalidated", {
    profileId,
    logSource,
    storedRef,
    cacheKey: key,
    cacheState: describeMoveProfilePhotoCache(storedRef, profileId),
    extra: { layer: "signed" },
  });
}

/** Invalide display + signed pour une ref — réessai immédiat avec nouvelle signed URL. */
export function invalidateMoveProfilePhotoRefCaches(
  storedRef: string,
  profileId?: string | null,
  logSource?: string | null,
): void {
  invalidateMoveProfilePhotoDisplay(storedRef, profileId, logSource);
  invalidateMoveProfilePhotoSignedUrl(storedRef, profileId, logSource);
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, storedRef);
  inflightDisplay.delete(cacheKey);
}

export function clearAllMoveProfilePhotoCaches(): void {
  for (const entry of displayByKey.values()) {
    revokeBlobIfNeeded(entry);
  }
  displayByKey.clear();
  signedUrlByRef.clear();
  signedFailureUntilByRef.clear();
  inflightSigned.clear();
  inflightDisplay.clear();
  displayListeners.clear();
}

/** Retire les entrées display liées au viewer précédent (photos propres au compte). */
export function purgeMoveProfilePhotoCachesForViewer(viewerUserId: string): void {
  const prefix = `${viewerUserId.trim()}|`;
  for (const key of [...displayByKey.keys()]) {
    if (key.startsWith(prefix)) {
      revokeBlobIfNeeded(displayByKey.get(key));
      displayByKey.delete(key);
    }
  }
}

function readSignedCache(storedRef: string): string | null {
  const key = refKeyFromStoredRef(storedRef);
  const backoffUntil = signedFailureUntilByRef.get(key);
  if (backoffUntil != null && Date.now() < backoffUntil) {
    return null;
  }
  if (backoffUntil != null && Date.now() >= backoffUntil) {
    signedFailureUntilByRef.delete(key);
  }
  const entry = signedUrlByRef.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() + SIGNED_REFRESH_BUFFER_MS) {
    signedUrlByRef.delete(key);
    return null;
  }
  return entry.url;
}

function writeSignedCache(storedRef: string, url: string): void {
  const key = refKeyFromStoredRef(storedRef);
  signedFailureUntilByRef.delete(key);
  signedUrlByRef.set(key, {
    url,
    expiresAt: Date.now() + SIGNED_CACHE_TTL_MS,
  });
}

function markSignedFetchFailure(storedRef: string): void {
  signedFailureUntilByRef.set(
    refKeyFromStoredRef(storedRef),
    Date.now() + SIGNED_FAILURE_BACKOFF_MS,
  );
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

  const key = refKeyFromStoredRef(trimmed);
  const inflight = inflightSigned.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const normalized = normalizeProfilePhotoStoredRef(trimmed, supabase);
    if (!normalized) return null;
    if (shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
      writeSignedCache(trimmed, normalized);
      logIosPhotoDiag("signed_url_created", {
        profileId: context?.profileId ?? null,
        logSource: context?.logSource ?? null,
        storedRef: trimmed,
        displaySrc: normalized,
        cacheKey: key,
        extra: { passThrough: true },
      });
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
    if (signed) {
      writeSignedCache(trimmed, signed);
      logIosPhotoDiag("signed_url_created", {
        profileId: context?.profileId ?? null,
        logSource: context?.logSource ?? null,
        storedRef: trimmed,
        displaySrc: signed,
        cacheKey: key,
        extra: { objectPath },
      });
    } else if (!shouldPassThroughProfilePhotoDisplayUrl(normalized)) {
      markSignedFetchFailure(trimmed);
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
 * Résout et met en cache l'URL affichable Move (HTTPS web, data: iOS).
 * Display cache indexé par profile.id + storedRef.
 */
export async function ensureMoveProfilePhotoDisplay(
  storedRef: string,
  options?: { profileId?: string | null; logSource?: string; prefetch?: boolean },
): Promise<string | null> {
  const trimmed = storedRef.trim();
  if (!trimmed) return null;
  const profileId = options?.profileId ?? null;
  const logSource = options?.logSource ?? null;
  const cacheKey = moveProfilePhotoDisplayCacheKey(profileId, trimmed);

  const cached = getMoveProfilePhotoDisplaySync(trimmed, profileId, logSource);
  if (cached) return cached;

  const inflight = inflightDisplay.get(cacheKey);
  if (inflight) return inflight;

  const promise = withFetchSlot(async () => {
    const signed = await getMoveProfilePhotoSignedUrlCached(trimmed, {
      profileId,
      logSource,
    });
    const objectPath = profilePhotoObjectPathFromStoredValue(trimmed);
    logDiscoverProfilePhotoDiag({
      phase: "signed_url_ready",
      profileId,
      logSource,
      storedRef: trimmed,
      objectPath,
      displaySrc: signed,
      passThrough: shouldPassThroughProfilePhotoDisplayUrl(trimmed),
      extra: { signedUrlPresent: Boolean(signed) },
    });

    if (!isIosNative()) {
      if (signed) {
        rememberDisplay(profileId, trimmed, signed, "https", logSource);
        return signed;
      }
      logDiscoverProfilePhotoDiag({
        phase: "web_display_unresolved",
        profileId,
        logSource,
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
        rememberDisplay(profileId, trimmed, dataUrl, "data", logSource);
        logPhotoIosDebug("final_img_src", {
          screen: logSource ?? "discover",
          profileId,
          srcKind: classifyImgSrcForIosDebug(dataUrl),
          storedRef: photoUrlPrefix(trimmed),
        });
        return dataUrl;
      }
    }

    invalidateMoveProfilePhotoSignedUrl(trimmed, profileId, logSource);
    markSignedFetchFailure(trimmed);
    logDiscoverProfilePhotoDiag({
      phase: "ios_fetch_failed",
      profileId,
      logSource,
      storedRef: trimmed,
      objectPath,
      displaySrc: signed,
      error: "ios_capacitor_fetch_exhausted",
      extra: { candidateCount: candidates.length },
    });
    notifyDisplayListeners(cacheKey, null);
    return null;
  });

  inflightDisplay.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightDisplay.delete(cacheKey);
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
    if (getMoveProfilePhotoDisplaySync(ref, profile.id ?? null)) continue;
    void ensureMoveProfilePhotoDisplay(ref, {
      profileId: profile.id ?? null,
      prefetch: true,
      logSource: "move.prefetch",
    });
  }
}

/** @deprecated alias tests */
export function refKey(storedRef: string): string {
  return refKeyFromStoredRef(storedRef);
}
