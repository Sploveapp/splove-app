import { Capacitor } from "@capacitor/core";
import { capacitorFetch } from "./supabaseCapacitorFetch";

const CACHE_MAX_ENTRIES = 32;
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
  return dataUrlCache.get(cacheKey(url)) ?? null;
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

/**
 * GET image via CapacitorHttp → `data:image/jpeg;base64,…` (cache mémoire par URL).
 */
export async function fetchCapacitorImageDataUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!isRemoteHttpImageUrl(trimmed)) return null;
  if (!shouldUseIosCapacitorImageFallback()) return null;

  const key = cacheKey(trimmed);
  const cached = dataUrlCache.get(key);
  if (cached) return cached;

  try {
    const res = await capacitorFetch(trimmed, { method: "GET" });
    if (!res.ok) {
      console.warn("[capacitorImageDataUrl] http_error", {
        url: trimmed.slice(0, 96),
        status: res.status,
      });
      return null;
    }
    const rawType = res.headers.get("content-type") || "image/jpeg";
    const mime = rawType.split(";")[0]?.trim() || "image/jpeg";
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) return null;
    const dataUrl = `data:${mime};base64,${uint8ToBase64(new Uint8Array(buffer))}`;
    rememberDataUrl(trimmed, dataUrl);
    console.log("[capacitorImageDataUrl] cached", {
      url: trimmed.slice(0, 96),
      mime,
      bytes: buffer.byteLength,
    });
    return dataUrl;
  } catch (e) {
    console.warn("[capacitorImageDataUrl] fetch_failed", {
      url: trimmed.slice(0, 96),
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
