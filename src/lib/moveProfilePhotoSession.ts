import { clearCapacitorImageDataUrlCache } from "./capacitorImageDataUrl";
import {
  clearAllMoveProfilePhotoCaches,
  purgeMoveProfilePhotoCachesForViewer,
} from "./moveProfilePhotoCache";
import {
  clearMoveProfilePhotoRowDiagRegistry,
  logIosPhotoDiag,
  setIosPhotoDiagAuthUserId,
} from "./iosPhotoDiag";
import { clearProfilePhotoStorageHealthCache } from "./profilePhotoStorageHealth";

let lastViewerUserId: string | null = null;

/**
 * À appeler à chaque changement de session auth (AuthContext).
 * Vide les caches Move/iOS pour ne jamais réutiliser displaySrc d’un ancien viewer ou profil.
 */
export function onMovePhotoAuthSessionChange(
  nextViewerUserId: string | null | undefined,
  prevViewerUserId: string | null | undefined,
  reason: string,
): void {
  const next = typeof nextViewerUserId === "string" && nextViewerUserId.trim() ? nextViewerUserId.trim() : null;
  const prev = typeof prevViewerUserId === "string" && prevViewerUserId.trim() ? prevViewerUserId.trim() : null;

  if (next === prev && next === lastViewerUserId) return;

  if (prev) {
    purgeMoveProfilePhotoCachesForViewer(prev);
  }
  if (!next || next !== prev) {
    clearAllMoveProfilePhotoCaches();
    clearCapacitorImageDataUrlCache();
    clearProfilePhotoStorageHealthCache();
    clearMoveProfilePhotoRowDiagRegistry();
  }

  setIosPhotoDiagAuthUserId(next);
  lastViewerUserId = next;

  logIosPhotoDiag("session_changed", {
    extra: {
      reason,
      prevViewerUserId: prev,
      prevViewerUserIdPrefix: prev ? `${prev.slice(0, 8)}…` : null,
      nextViewerUserId: next,
      nextViewerUserIdPrefix: next ? `${next.slice(0, 8)}…` : null,
    },
  });
}

export function getMovePhotoSessionViewerUserId(): string | null {
  return lastViewerUserId;
}
