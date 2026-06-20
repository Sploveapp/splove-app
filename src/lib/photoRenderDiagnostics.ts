import { Capacitor } from "@capacitor/core";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export type PhotoRenderDiagnosticContext = {
  screen: string;
  view?: string;
  payloadDisplaySrc?: string | null;
  payloadResolvedUrl?: string | null;
  extra?: Record<string, unknown>;
};

function classifyImgSrc(src: string): string {
  const t = src.trim();
  if (!t) return "empty";
  if (t.startsWith("blob:")) return "blob";
  if (t.startsWith("data:")) return "data";
  if (t.startsWith("capacitor://")) return "capacitor";
  if (t.startsWith("file://")) return "file";
  if (t.includes("/assets/") || t.includes("splove-mark")) return "bundled_asset";
  if (t.startsWith("https://")) return "remote_https";
  if (t.startsWith("http://")) return "remote_http";
  return "other";
}

function snapshotImgElement(img: HTMLImageElement) {
  return {
    imgSrcExact: img.src || null,
    imgCurrentSrcExact: img.currentSrc || null,
    imgSrcKind: classifyImgSrc(img.src || ""),
    imgComplete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    imgWidthAttr: img.width,
    imgHeightAttr: img.height,
  };
}

function snapshotNativeEvent(event: Event) {
  const ne = event as Event & { message?: string; error?: unknown };
  return {
    eventType: event.type,
    isTrusted: event.isTrusted,
    timeStamp: event.timeStamp,
    nativeMessage: typeof ne.message === "string" ? ne.message : null,
    nativeError:
      ne.error instanceof Error
        ? ne.error.message
        : ne.error != null
          ? String(ne.error)
          : null,
  };
}

/** HEAD best-effort — même stack `fetch` que `probeProfilePhotoDisplayUrlHttpStatus` (CapacitorHttp sur iOS). */
export async function probeImgUrlHeadForDiagnostics(
  url: string,
): Promise<Record<string, unknown>> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return { skipped: true, reason: "non_http_src" };
  }
  try {
    const res = await fetch(trimmed, { method: "HEAD" });
    return {
      httpStatus: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.get("content-length"),
    };
  } catch (e) {
    return {
      httpStatus: null,
      ok: false,
      contentType: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function logPhotoRenderImgLoad(
  ctx: PhotoRenderDiagnosticContext,
  img: HTMLImageElement,
  event: Event,
): void {
  console.log("[PhotoRender] img_onload_detail", {
    screen: ctx.screen,
    view: ctx.view ?? null,
    platform: Capacitor.getPlatform(),
    isNativeCapacitor: Capacitor.isNativePlatform(),
    capacitorHttpEnabled: Capacitor.isNativePlatform(),
    payloadDisplaySrc: photoUrlPrefix(ctx.payloadDisplaySrc ?? null),
    payloadResolvedUrl: photoUrlPrefix(ctx.payloadResolvedUrl ?? null),
    payloadMatchesImgSrc:
      Boolean(ctx.payloadDisplaySrc) && img.src === ctx.payloadDisplaySrc,
    ...snapshotImgElement(img),
    ...snapshotNativeEvent(event),
    ...(ctx.extra ?? {}),
  });
}

export function logPhotoRenderImgError(
  ctx: PhotoRenderDiagnosticContext,
  img: HTMLImageElement,
  event: Event,
): void {
  const base = {
    screen: ctx.screen,
    view: ctx.view ?? null,
    platform: Capacitor.getPlatform(),
    isNativeCapacitor: Capacitor.isNativePlatform(),
    capacitorHttpNote:
      "fetch/HEAD uses CapacitorHttp on native; <img src> uses WKWebView loader (not CapacitorHttp)",
    convertFileSrcUsed: false,
    payloadDisplaySrc: photoUrlPrefix(ctx.payloadDisplaySrc ?? null),
    payloadDisplaySrcExact: ctx.payloadDisplaySrc ?? null,
    payloadResolvedUrl: photoUrlPrefix(ctx.payloadResolvedUrl ?? null),
    payloadResolvedUrlExact: ctx.payloadResolvedUrl ?? null,
    payloadMatchesImgSrc:
      Boolean(ctx.payloadDisplaySrc) && img.src === ctx.payloadDisplaySrc,
    imgSrcDiffersFromPayload:
      Boolean(ctx.payloadDisplaySrc) && img.src !== ctx.payloadDisplaySrc,
    ...snapshotImgElement(img),
    ...snapshotNativeEvent(event),
    ...(ctx.extra ?? {}),
  };
  console.log("[PhotoRender] img_onerror_detail", base);

  const probeUrl = img.currentSrc || img.src;
  void probeImgUrlHeadForDiagnostics(probeUrl).then((head) => {
    console.log("[PhotoRender] img_onerror_head", {
      ...base,
      probeUrl: photoUrlPrefix(probeUrl),
      probeUrlExact: probeUrl,
      head,
    });
  });
}
