import { shouldUseIosCapacitorImageFallback } from "./capacitorImageDataUrl";

type IosPhotoImgHandlerOptions = {
  iosOnError: () => void;
  photoOnError: () => void;
  photoOnLoad: () => void;
  iosResolutionFailed: boolean;
};

/**
 * Sur iOS, WKWebView déclenche img_onerror sur les URLs HTTPS distantes.
 * On laisse CapacitorHttp tenter la conversion data URL avant d’avancer les candidats du hook photo.
 */
export function buildIosAwareProfilePhotoImgHandlers(
  options: IosPhotoImgHandlerOptions,
): { onLoad: () => void; onError: () => void } {
  return {
    onLoad: options.photoOnLoad,
    onError: () => {
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
