import { useMemo } from "react";
import {
  brokenProfilePhotoReuploadMessageKey,
  peekBrokenProfilePhotoReuploadSlots,
} from "../lib/profilePhotoBrokenReconcile";

/** Bannière « ré-uploader » après purge d’URLs Storage cassées (0 octet). */
export function useBrokenProfilePhotoReuploadHint(userId: string | null | undefined) {
  const slots = useMemo(
    () => (userId ? peekBrokenProfilePhotoReuploadSlots(userId) : null),
    [userId],
  );
  const messageKey = brokenProfilePhotoReuploadMessageKey(slots);
  return {
    slots,
    messageKey,
    needsReupload: Boolean(messageKey),
  };
}
