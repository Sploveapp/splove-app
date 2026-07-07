import { clearProfilePhotoResolutionCache } from "../hooks/useProfilePhotoSignedUrl";
import { clearCapacitorImageDataUrlCache } from "./capacitorImageDataUrl";
import { resetConnectedProfileAvatarDiagDedup } from "./profilePhotoIosDisplay";

/** Invalide les caches d’affichage photo (signed URL échouée, upload, changement de compte). */
export function invalidateProfilePhotoDisplayCaches(reason: string): void {
  clearProfilePhotoResolutionCache();
  clearCapacitorImageDataUrlCache();
  resetConnectedProfileAvatarDiagDedup();
  console.log("[ProfilePhoto] display caches invalidated", { reason });
}
