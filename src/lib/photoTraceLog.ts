/**
 * Diagnostic-only photo tracing. Does not alter resolution, state, or display logic.
 * Temporary: remove after iOS photo disappearance root-cause is confirmed.
 */

export type PhotoTracePayload = {
  screen: string;
  component: string;
  userId?: string | null;
  portrait_url?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
  portraitDisplayResolved?: string | null;
  facePreviewSrc?: string | null;
  finalImgSrc?: string | null;
  imgWidth?: number | null;
  imgHeight?: number | null;
  imgOnLoad?: boolean | null;
  imgOnError?: boolean | null;
  extra?: Record<string, unknown>;
};

/** Which photo UI component is actually mounted / rendering. */
export function logPhotoComponent(componentFile: string, extra?: Record<string, unknown>): void {
  console.log("[PHOTO_COMPONENT]", componentFile, extra ?? {});
}

/** Full TRACE block in the exact format requested for iPhone console. */
export function logPhotoTrace(payload: PhotoTracePayload): void {
  console.log("----------------------------------------");
  console.log("[PHOTO_TRACE]");
  console.log("screen:", payload.screen);
  console.log("component:", payload.component);
  console.log("userId:", payload.userId ?? null);
  console.log("portrait_url:", payload.portrait_url ?? null);
  console.log("main_photo_url:", payload.main_photo_url ?? null);
  console.log("avatar_url:", payload.avatar_url ?? null);
  console.log("portraitDisplayResolved:", payload.portraitDisplayResolved ?? null);
  console.log("facePreviewSrc:", payload.facePreviewSrc ?? null);
  console.log("finalImgSrc:", payload.finalImgSrc ?? null);
  console.log("imgWidth:", payload.imgWidth ?? null);
  console.log("imgHeight:", payload.imgHeight ?? null);
  console.log("imgOnLoad:", payload.imgOnLoad ?? null);
  console.log("imgOnError:", payload.imgOnError ?? null);
  if (payload.extra && Object.keys(payload.extra).length > 0) {
    console.log("extra:", payload.extra);
  }
  console.log("----------------------------------------");
}

export type PhotoTraceImgMeta = {
  screen: string;
  component: string;
  userId?: string | null;
  slot?: string | null;
  /** src React prop received by the component */
  srcReceived?: string | null;
};

/** Log at the real <img> boundary: src reçu / utilisé / load / error / natural size. */
export function logPhotoTraceImgEvent(
  phase: "mount" | "onLoad" | "onError",
  meta: PhotoTraceImgMeta,
  img?: HTMLImageElement | null,
): void {
  const used = img?.currentSrc || img?.src || meta.srcReceived || null;
  console.log("[PHOTO_TRACE_IMG]", {
    phase,
    screen: meta.screen,
    component: meta.component,
    userId: meta.userId ?? null,
    slot: meta.slot ?? null,
    src_recu: meta.srcReceived ?? null,
    src_reellement_utilise: used,
    onLoad: phase === "onLoad",
    onError: phase === "onError",
    naturalWidth: img?.naturalWidth ?? null,
    naturalHeight: img?.naturalHeight ?? null,
    imgWidth: img?.width ?? null,
    imgHeight: img?.height ?? null,
    complete: img?.complete ?? null,
  });
}

type ImgSyntheticEvent = {
  currentTarget: HTMLImageElement;
};

/**
 * Wrap existing img handlers to ADD logs only — original handlers always run unchanged.
 */
export function wrapPhotoTraceImgHandlers<E extends ImgSyntheticEvent>(
  meta: PhotoTraceImgMeta,
  existing?: {
    onLoad?: (event: E) => void;
    onError?: (event: E) => void;
  },
): {
  onLoad: (event: E) => void;
  onError: (event: E) => void;
} {
  return {
    onLoad: (event) => {
      logPhotoTraceImgEvent("onLoad", meta, event.currentTarget);
      existing?.onLoad?.(event);
    },
    onError: (event) => {
      logPhotoTraceImgEvent("onError", meta, event.currentTarget);
      existing?.onError?.(event);
    },
  };
}
