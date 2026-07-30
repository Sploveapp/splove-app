import { classifyImgSrcForIosDebug } from "./photoIosDebug";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

/** Audit ID composant « Mon profil » — jamais d’URL complète, email, token ou base64. */
function safeSrcForAudit(src: string | null | undefined): string | null {
  if (!src?.trim()) return null;
  const kind = classifyImgSrcForIosDebug(src);
  if (kind === "data_url" || kind === "blob_url") return kind;
  return photoUrlPrefix(src);
}

export type ProfilePhotoComponentFoundPayload = {
  component: string;
  "props.photo": string | null;
  displaySrc: string | null;
  "img.src": string | null;
  onLoad: boolean | null;
  onError: boolean | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
};

export function logProfilePhotoComponentFound(payload: ProfilePhotoComponentFoundPayload): void {
  console.log("[PROFILE_PHOTO_COMPONENT_FOUND]", payload);
}

export function auditSrcKindOrPrefix(src: string | null | undefined): string | null {
  return safeSrcForAudit(src);
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Audit temporaire : `fetch()` exact sur displaySrc (même URL que l’`<img>`),
 * pour voir ce que WKWebView obtient réellement de Supabase. Aucun masquage d’erreur.
 */
export async function auditProfilePhotoDisplaySrcHttpFetch(displaySrc: string): Promise<void> {
  const url = displaySrc.trim();
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.log("[PROFILE_PHOTO_DISPLAY_SRC_HTTP_AUDIT]", {
      url,
      skipped: true,
      reason: "not_http_https",
    });
    return;
  }

  try {
    const res = await fetch(url);
    const allHeaders = headersToObject(res.headers);
    const blob = await res.blob();
    const firstBytes = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
    const firstByte = firstBytes.length > 0 ? firstBytes[0]! : null;

    console.log("[PROFILE_PHOTO_DISPLAY_SRC_HTTP_AUDIT]", {
      url,
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      type: res.type,
      statusText: res.statusText,
      "content-type": res.headers.get("content-type"),
      "content-length": res.headers.get("content-length"),
      "cache-control": res.headers.get("cache-control"),
      "access-control-allow-origin": res.headers.get("access-control-allow-origin"),
      "access-control-expose-headers": res.headers.get("access-control-expose-headers"),
      "access-control-allow-credentials": res.headers.get("access-control-allow-credentials"),
      allHeaders,
      blob: {
        type: blob.type,
        size: blob.size,
        firstByte,
      },
    });
  } catch (err) {
    console.error("[PROFILE_PHOTO_DISPLAY_SRC_HTTP_AUDIT] fetch failed", {
      url,
      error: err,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : null,
      errorString: String(err),
      errorJson:
        err && typeof err === "object"
          ? (() => {
              try {
                return JSON.stringify(err, Object.getOwnPropertyNames(err));
              } catch (stringifyErr) {
                return `stringify_failed:${String(stringifyErr)}`;
              }
            })()
          : null,
    });
  }
}
