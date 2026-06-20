import { snapshotProfilePhotoFields } from "./profilePhotoPipelineLog";

/** Active via `VITE_PHOTO_DEBUG=true` ou `localStorage.setItem("PHOTO_DEBUG", "1")`. */
export function isPhotoDebugEnabled(): boolean {
  if (import.meta.env.VITE_PHOTO_DEBUG === "true") return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("PHOTO_DEBUG") === "1";
  } catch {
    return false;
  }
}

export function logPhotoDebug(
  phase:
    | "upload_result"
    | "mergeAuthProfileRow"
    | "commitProfileRow"
    | "refetchProfile"
    | "persist_readback"
    | "final_profile_urls",
  payload: Record<string, unknown>,
): void {
  if (!isPhotoDebugEnabled()) return;
  console.log("PHOTO_DEBUG", phase, payload);
}

export function photoDebugRowSnapshot(row: Record<string, unknown> | null | undefined) {
  return snapshotProfilePhotoFields(row);
}
