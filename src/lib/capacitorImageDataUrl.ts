import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { PhotoFlowLog } from "./photoFlowLog";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { logPhotoIosDebug } from "./photoIosDebug";
import {
  isValidCachedImageDataUrl,
  normalizeAndValidateCapacitorImageResponseToDataUrl,
} from "./normalizeCapacitorImageResponseToDataUrl";

/** Bump : jette les data URLs corrompues (double encodage) encore en mémoire. */
const DATA_URL_CACHE_FORMAT = 3;
const CACHE_MAX_ENTRIES = 32;
const FETCH_TIMEOUT_MS = 25_000;

type CacheEntry = { format: number; dataUrl: string };
const dataUrlCache = new Map<string, CacheEntry>();

/** iOS WKWebView : `<img src=https://…>` échoue souvent ; CapacitorHttp GET fonctionne. */
export function shouldUseIosCapacitorImageFallback(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function isRemoteHttpImageUrl(src: string | null | undefined): boolean {
  const t = typeof src === "string" ? src.trim() : "";
  return t.startsWith("https://") || t.startsWith("http://");
}

function cacheKey(url: string): string {
  return url.split("?")[0]?.split("#")[0] ?? url;
}

export function getCachedCapacitorImageDataUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const key = cacheKey(trimmed);
  const entry = dataUrlCache.get(key);
  if (!entry) return null;
  if (entry.format !== DATA_URL_CACHE_FORMAT || !isValidCachedImageDataUrl(entry.dataUrl)) {
    dataUrlCache.delete(key);
    return null;
  }
  return entry.dataUrl;
}

function rememberDataUrl(url: string, dataUrl: string): void {
  if (!isValidCachedImageDataUrl(dataUrl)) return;
  const key = cacheKey(url);
  if (dataUrlCache.size >= CACHE_MAX_ENTRIES && !dataUrlCache.has(key)) {
    const oldest = dataUrlCache.keys().next().value;
    if (oldest) dataUrlCache.delete(oldest);
  }
  dataUrlCache.set(key, { format: DATA_URL_CACHE_FORMAT, dataUrl });
}

function contentTypeFromHeaders(headers: Record<string, unknown> | undefined): string {
  if (!headers) return "image/jpeg";
  const raw =
    (headers["Content-Type"] as string | undefined) ??
    (headers["content-type"] as string | undefined) ??
    (headers["Content-type"] as string | undefined);
  return (typeof raw === "string" ? raw.split(";")[0]?.trim() : "") || "image/jpeg";
}

/**
 * GET image via CapacitorHttp natif (pas capacitorFetch — évite corruption binaire JSON.stringify).
 * `responseType: "arraybuffer"` : octets binaires → base64 une seule fois (jamais double btoa).
 */
async function fetchOneRemoteImageDataUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!isRemoteHttpImageUrl(trimmed)) return null;

  PhotoFlowLog.urlResolveAttempt({
    screen: "ios.capacitor_http",
    storedRef: trimmed,
    refIndex: 0,
    candidateCount: 1,
  });

  try {
    const response = await Promise.race([
      CapacitorHttp.get({ url: trimmed, responseType: "arraybuffer" }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("CapacitorHttp image timeout")), FETCH_TIMEOUT_MS);
      }),
    ]);

    const status = response.status ?? 0;
    const mime = contentTypeFromHeaders(response.headers as Record<string, unknown> | undefined);

    logPhotoIosDebug("fetch_status", {
      status,
      mime,
      urlHost: (() => {
        try {
          return new URL(trimmed).hostname;
        } catch {
          return trimmed.slice(0, 48);
        }
      })(),
      responseDataType: response.data == null ? "null" : typeof response.data,
    });

    if (status < 200 || status >= 300) {
      PhotoFlowLog.imageLoadError({
        context: "ios.capacitor_http",
        storedRef: trimmed,
        displayUrl: trimmed,
        error: `http_${status}`,
      });
      return null;
    }

    const dataUrl = await normalizeAndValidateCapacitorImageResponseToDataUrl(response.data, mime);
    if (!dataUrl) {
      PhotoFlowLog.imageLoadError({
        context: "ios.capacitor_http",
        storedRef: trimmed,
        displayUrl: trimmed,
        error: "data_url_normalize_or_decode_failed",
      });
      return null;
    }

    logPhotoIosDebug("blob_created", {
      mime,
      bytesEstimate: Math.max(0, Math.floor((dataUrl.length - dataUrl.indexOf(",")) * 0.75)),
      srcKind: "data_url",
    });

    PhotoFlowLog.profilePhotoResolved({
      screen: "ios.capacitor_http",
      storedRef: trimmed,
      displayUrl: dataUrl,
      resolveKind: "data",
    });

    return dataUrl;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    PhotoFlowLog.imageLoadError({
      context: "ios.capacitor_http",
      storedRef: trimmed,
      displayUrl: trimmed,
      error: message,
    });
    return null;
  }
}

/**
 * GET image(s) via CapacitorHttp → `data:image/jpeg;base64,…` (cache mémoire par URL).
 * Essaie `url` puis chaque fallback (signed → public, etc.).
 */
export async function fetchCapacitorImageDataUrl(
  url: string,
  fallbackUrls: string[] = [],
): Promise<string | null> {
  const trimmed = url.trim();
  if (!isRemoteHttpImageUrl(trimmed)) return null;
  if (!shouldUseIosCapacitorImageFallback()) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [trimmed, ...fallbackUrls]) {
    const t = typeof candidate === "string" ? candidate.trim() : "";
    if (!t || !isRemoteHttpImageUrl(t) || seen.has(t)) continue;
    seen.add(t);
    candidates.push(t);
  }

  for (const candidate of candidates) {
    const cached = getCachedCapacitorImageDataUrl(candidate);
    if (cached) {
      rememberDataUrl(trimmed, cached);
      return cached;
    }
  }

  for (const candidate of candidates) {
    const dataUrl = await fetchOneRemoteImageDataUrl(candidate);
    if (!dataUrl) continue;
    rememberDataUrl(candidate, dataUrl);
    rememberDataUrl(trimmed, dataUrl);
    console.log("[PhotoFlow] ios_capacitor_data_url_ready", {
      requestedUrl: photoUrlPrefix(trimmed),
      fetchedUrl: photoUrlPrefix(candidate),
      mime: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
      bytesEstimate: Math.max(0, Math.floor((dataUrl.length - dataUrl.indexOf(",")) * 0.75)),
    });
    return dataUrl;
  }

  return null;
}

/** Vide le cache mémoire (upload, changement de compte, invalidation manuelle). */
export function clearCapacitorImageDataUrlCache(): void {
  dataUrlCache.clear();
}

/** Purge les entrées data URL invalides / ancien format (double encodage). */
export function purgeInvalidCapacitorImageDataUrlCache(): number {
  let removed = 0;
  for (const [key, entry] of [...dataUrlCache.entries()]) {
    if (entry.format !== DATA_URL_CACHE_FORMAT || !isValidCachedImageDataUrl(entry.dataUrl)) {
      dataUrlCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

// Au chargement du module : aucune entrée ancien format ne doit survivre.
purgeInvalidCapacitorImageDataUrlCache();
