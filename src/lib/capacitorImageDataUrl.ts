import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { PhotoFlowLog } from "./photoFlowLog";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";
import { logPhotoIosDebug } from "./photoIosDebug";

const CACHE_MAX_ENTRIES = 32;
const FETCH_TIMEOUT_MS = 25_000;
const dataUrlCache = new Map<string, string>();

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
  return dataUrlCache.get(cacheKey(trimmed)) ?? null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function rememberDataUrl(url: string, dataUrl: string): void {
  const key = cacheKey(url);
  if (dataUrlCache.size >= CACHE_MAX_ENTRIES && !dataUrlCache.has(key)) {
    const oldest = dataUrlCache.keys().next().value;
    if (oldest) dataUrlCache.delete(oldest);
  }
  dataUrlCache.set(key, dataUrl);
}

function contentTypeFromHeaders(headers: Record<string, unknown> | undefined): string {
  if (!headers) return "image/jpeg";
  const raw =
    (headers["Content-Type"] as string | undefined) ??
    (headers["content-type"] as string | undefined) ??
    (headers["Content-type"] as string | undefined);
  return (typeof raw === "string" ? raw.split(";")[0]?.trim() : "") || "image/jpeg";
}

function dataUrlFromCapacitorBody(data: unknown, mime: string): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:")) return trimmed;
    if (trimmed.startsWith("{") || trimmed.startsWith("<") || trimmed.startsWith("[")) {
      return null;
    }
    return `data:${mime};base64,${trimmed}`;
  }

  if (data instanceof ArrayBuffer) {
    if (!data.byteLength) return null;
    return `data:${mime};base64,${uint8ToBase64(new Uint8Array(data))}`;
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    if (!view.byteLength) return null;
    return `data:${mime};base64,${uint8ToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))}`;
  }

  return null;
}

/**
 * GET image via CapacitorHttp natif (pas capacitorFetch — évite corruption binaire JSON.stringify).
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
      CapacitorHttp.get({ url: trimmed, responseType: "blob" }),
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

    const dataUrl = dataUrlFromCapacitorBody(response.data, mime);
    if (!dataUrl) {
      PhotoFlowLog.imageLoadError({
        context: "ios.capacitor_http",
        storedRef: trimmed,
        displayUrl: trimmed,
        error: "unrecognized_response_body",
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
