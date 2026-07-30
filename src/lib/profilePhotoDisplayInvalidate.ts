import { clearProfilePhotoResolutionCache } from "../hooks/useProfilePhotoSignedUrl";
import { clearCapacitorImageDataUrlCache } from "./capacitorImageDataUrl";
import { resetConnectedProfileAvatarDiagDedup } from "./profilePhotoIosDisplay";
import { clearAllMoveProfilePhotoCaches } from "./moveProfilePhotoCache";
import { clearProfilePhotoStorageHealthCache } from "./profilePhotoStorageHealth";

/**
 * Invalide les caches d’affichage photo (signed URL échouée, upload, Apple/Google post-auth).
 * Inclut le cache Move/Discover — sinon l’ancien displaySrc (souvent octet-stream) reste servi.
 */
export function invalidateProfilePhotoDisplayCaches(reason: string): void {
  clearProfilePhotoResolutionCache();
  clearCapacitorImageDataUrlCache();
  resetConnectedProfileAvatarDiagDedup();
  clearAllMoveProfilePhotoCaches();
  clearProfilePhotoStorageHealthCache();
  console.log("[ProfilePhoto] display caches invalidated", { reason });
}
