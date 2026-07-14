import { shouldUseIosCapacitorImageFallback } from "./capacitorImageDataUrl";

export type PhotoIosDebugPhase =
  | "final_img_src"
  | "fetch_status"
  | "blob_created"
  | "img_onload"
  | "img_onerror";

export function classifyImgSrcForIosDebug(src: string | null | undefined): string {
  if (src == null) return "null";
  const t = src.trim();
  if (!t) return "empty";
  if (t.startsWith("data:")) return "data_url";
  if (t.startsWith("blob:")) return "blob_url";
  if (t.startsWith("capacitor://")) return "capacitor_scheme";
  if (t.startsWith("https://") || t.startsWith("http://")) {
    if (t.includes("/object/sign/")) return "https_signed";
    if (t.includes("/object/public/")) return "https_public";
    return "https_remote";
  }
  return "other";
}

export function logPhotoIosDebug(
  phase: PhotoIosDebugPhase,
  extra?: Record<string, unknown>,
): void {
  if (!shouldUseIosCapacitorImageFallback()) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[PHOTO_IOS_DEBUG] ${phase}`, extra);
  } else {
    console.log(`[PHOTO_IOS_DEBUG] ${phase}`);
  }
}
