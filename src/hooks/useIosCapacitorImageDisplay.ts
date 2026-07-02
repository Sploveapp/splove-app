import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCapacitorImageDataUrl,
  getCachedCapacitorImageDataUrl,
  isRemoteHttpImageUrl,
  shouldUseIosCapacitorImageFallback,
} from "../lib/capacitorImageDataUrl";

type Options = {
  /** signed URL, public URL, etc. — essayées dans l’ordre si la première échoue. */
  fallbackUrls?: string[];
};

type State = {
  /** URL affichée dans `<img>` — sur iOS : data URL uniquement (jamais HTTPS distant). */
  displaySrc: string | null;
  /** CapacitorHttp GET en cours. */
  isResolving: boolean;
  /** true quand le rendu utilise la data URL (cache ou fraîche). */
  usingDataUrl: boolean;
  /** Toutes les URLs candidates ont échoué via CapacitorHttp. */
  resolutionFailed: boolean;
  onImageError: () => void;
};

/**
 * iOS : WKWebView ne charge pas les URLs Storage signées/public dans `<img>`.
 * On précharge via CapacitorHttp → data URL avant le rendu (pas d’attente img_onerror).
 */
export function useIosCapacitorImageDisplay(
  preferredSrc: string | null | undefined,
  options: Options = {},
): State {
  const preferred =
    typeof preferredSrc === "string" && preferredSrc.trim() ? preferredSrc.trim() : null;
  const fallbackUrls = options.fallbackUrls ?? [];
  const fallbackKey = fallbackUrls.join("\0");
  const iosEnabled =
    Boolean(preferred) && isRemoteHttpImageUrl(preferred) && shouldUseIosCapacitorImageFallback();

  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    iosEnabled && preferred ? getCachedCapacitorImageDataUrl(preferred) : null,
  );
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const inflightRef = useRef<string | null>(null);
  const resolutionFailedRef = useRef(false);
  resolutionFailedRef.current = resolutionFailed;

  const resolveViaCapacitorHttp = useCallback(() => {
    if (!iosEnabled || !preferred) return;

    const cached = getCachedCapacitorImageDataUrl(preferred);
    if (cached) {
      setDataUrl(cached);
      setResolutionFailed(false);
      resolutionFailedRef.current = false;
      return;
    }

    if (inflightRef.current === preferred) return;
    inflightRef.current = preferred;
    setIsResolving(true);
    setResolutionFailed(false);
    resolutionFailedRef.current = false;

    void fetchCapacitorImageDataUrl(preferred, fallbackUrls).then((result) => {
      if (inflightRef.current === preferred) {
        inflightRef.current = null;
      }
      setIsResolving(false);
      if (result) {
        setDataUrl(result);
        setResolutionFailed(false);
        resolutionFailedRef.current = false;
      } else {
        setResolutionFailed(true);
        resolutionFailedRef.current = true;
      }
    });
  }, [iosEnabled, preferred, fallbackUrls]);

  useEffect(() => {
    inflightRef.current = null;
    setIsResolving(false);
    setResolutionFailed(false);
    resolutionFailedRef.current = false;

    if (!iosEnabled || !preferred) {
      setDataUrl(null);
      return;
    }

    const cached = getCachedCapacitorImageDataUrl(preferred);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    setDataUrl(null);
    resolveViaCapacitorHttp();
  }, [iosEnabled, preferred, fallbackKey, resolveViaCapacitorHttp]);

  const onImageError = useCallback(() => {
    if (!iosEnabled) return;
    if (dataUrl) return;
    if (resolutionFailedRef.current) return;
    resolveViaCapacitorHttp();
  }, [iosEnabled, dataUrl, resolveViaCapacitorHttp]);

  const displaySrc = (() => {
    if (!preferred) return null;
    if (!iosEnabled) return preferred;
    if (dataUrl) return dataUrl;
    if (isResolving) return null;
    if (resolutionFailed) return null;
    return null;
  })();

  return {
    displaySrc,
    isResolving,
    usingDataUrl: Boolean(dataUrl),
    resolutionFailed,
    onImageError,
  };
}
