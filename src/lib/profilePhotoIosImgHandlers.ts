import { shouldUseIosCapacitorImageFallback } from "./capacitorImageDataUrl";
import { classifyImgSrcForIosDebug, logPhotoIosDebug } from "./photoIosDebug";

type IosPhotoImgHandlerOptions = {
  iosOnError: () => void;
  photoOnError: () => void;
  photoOnLoad: () => void;
  iosResolutionFailed: boolean;
  displaySrc?: string | null;
  screen?: string;
};

/**
 * Sur iOS, WKWebView déclenche img_onerror sur les URLs HTTPS distantes.
 * On laisse CapacitorHttp tenter la conversion data URL avant d’avancer les candidats du hook photo.
 */
export function buildIosAwareProfilePhotoImgHandlers(
  options: IosPhotoImgHandlerOptions,
): { onLoad: () => void; onError: () => void } {
  return {
    onLoad: () => {
      logPhotoIosDebug("img_onload", {
        screen: options.screen ?? "profile",
        srcKind: classifyImgSrcForIosDebug(options.displaySrc),
      });
      options.photoOnLoad();
    },
    onError: () => {
      logPhotoIosDebug("img_onerror", {
        screen: options.screen ?? "profile",
        srcKind: classifyImgSrcForIosDebug(options.displaySrc),
        iosResolutionFailed: options.iosResolutionFailed,
      });
      if (!shouldUseIosCapacitorImageFallback()) {
        options.photoOnError();
        return;
      }
      options.iosOnError();
      if (options.iosResolutionFailed) {
        options.photoOnError();
      }
    },
  };
}
