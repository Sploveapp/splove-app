import { shouldUseIosCapacitorImageFallback, isRemoteHttpImageUrl } from "./capacitorImageDataUrl";
import { photoUrlPrefix } from "./profilePhotoPipelineLog";

export function isSploveProfileStorageHttpUrl(url: string | null | undefined): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return false;
  return t.includes("/profile-photos/") || (t.includes("/object/sign/") && t.includes("profile-photos"));
}

export type IosAwareProfilePhotoDisplayInput = {
  iosDisplaySrc: string | null | undefined;
  remoteBase: string | null | undefined;
  isResolving?: boolean;
  resolutionFailed?: boolean;
  usingDataUrl?: boolean;
};

/**
 * iOS WKWebView : ne jamais mettre une URL Storage signée/publice dans `<img src>`
 * tant que CapacitorHttp n’a pas produit une data URL (sinon carré bleu « ? »).
 */
export function resolveIosAwareProfilePhotoDisplaySrc(
  input: IosAwareProfilePhotoDisplayInput,
): string | null {
  const iosSrc =
    typeof input.iosDisplaySrc === "string" && input.iosDisplaySrc.trim()
      ? input.iosDisplaySrc.trim()
      : null;
  const remote =
    typeof input.remoteBase === "string" && input.remoteBase.trim()
      ? input.remoteBase.trim()
      : null;

  if (!shouldUseIosCapacitorImageFallback()) {
    return iosSrc ?? remote;
  }

  if (iosSrc) return iosSrc;
  if (input.isResolving) return null;
  if (input.resolutionFailed && !input.usingDataUrl) return null;
  if (remote && !isSploveProfileStorageHttpUrl(remote)) return remote;
  return null;
}

export function shouldShowProfilePhotoLoadingPlaceholder(input: {
  displaySrc: string | null;
  isLoading: boolean;
  isResolving: boolean;
}): boolean {
  if (input.displaySrc) return false;
  return input.isLoading || input.isResolving;
}

export function canMountProfilePhotoImg(
  displaySrc: string | null | undefined,
  options: Pick<
    IosAwareProfilePhotoDisplayInput,
    "isResolving" | "resolutionFailed" | "usingDataUrl"
  > = {},
): boolean {
  const src = typeof displaySrc === "string" ? displaySrc.trim() : "";
  if (!src) return false;
  if (!shouldUseIosCapacitorImageFallback()) return true;
  if (options.isResolving) return false;
  if (options.resolutionFailed && !options.usingDataUrl) return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  if (!isRemoteHttpImageUrl(src)) return true;
  if (!isSploveProfileStorageHttpUrl(src)) return true;
  return false;
}

export type ConnectedProfileAvatarDiagPayload = {
  userId?: string | null;
  storedRefs?: string[];
  activeRef?: string | null;
  activeField?: string | null;
  remoteBase?: string | null;
  iosDisplaySrc?: string | null;
  displaySrc?: string | null;
  stickySrc?: string | null;
  isLoading?: boolean;
  isFailed?: boolean;
  iosResolving?: boolean;
  iosResolutionFailed?: boolean;
  iosUsingDataUrl?: boolean;
  bootPhotoFields?: Record<string, string | null> | null;
  profileFields?: Record<string, string | null> | null;
  phase?: string;
  error?: string | null;
};

let lastDiagKey = "";

export function logConnectedProfileAvatarDiag(payload: ConnectedProfileAvatarDiagPayload): void {
  const key = [
    payload.phase ?? "",
    payload.userId ?? "",
    payload.activeRef ?? "",
    photoUrlPrefix(payload.displaySrc),
    String(payload.isLoading),
    String(payload.iosResolving),
    String(payload.isFailed),
    String(payload.iosResolutionFailed),
  ].join("|");
  if (key === lastDiagKey) return;
  lastDiagKey = key;

  console.log("[ConnectedProfileAvatar]", payload.phase ?? "state", {
    userId: payload.userId?.slice(0, 8) ?? null,
    storedRefs: payload.storedRefs?.map((r) => photoUrlPrefix(r)),
    activeRef: photoUrlPrefix(payload.activeRef),
    activeField: payload.activeField ?? null,
    remoteBase: photoUrlPrefix(payload.remoteBase),
    iosDisplaySrc: photoUrlPrefix(payload.iosDisplaySrc),
    displaySrc: photoUrlPrefix(payload.displaySrc),
    stickySrc: photoUrlPrefix(payload.stickySrc),
    isLoading: payload.isLoading ?? false,
    isFailed: payload.isFailed ?? false,
    iosResolving: payload.iosResolving ?? false,
    iosResolutionFailed: payload.iosResolutionFailed ?? false,
    iosUsingDataUrl: payload.iosUsingDataUrl ?? false,
    bootPhotoFields: payload.bootPhotoFields ?? null,
    profileFields: payload.profileFields ?? null,
    error: payload.error ?? null,
  });
}

export function resetConnectedProfileAvatarDiagDedup(): void {
  lastDiagKey = "";
}
