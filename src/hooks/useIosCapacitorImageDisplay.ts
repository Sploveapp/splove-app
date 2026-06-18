import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCapacitorImageDataUrl,
  getCachedCapacitorImageDataUrl,
  isRemoteHttpImageUrl,
  shouldUseIosCapacitorImageFallback,
} from "../lib/capacitorImageDataUrl";

type State = {
  /** URL affichée : publique d’abord, puis data URL si fallback iOS. */
  displaySrc: string | null;
  /** CapacitorHttp GET en cours après img_onerror. */
  isResolving: boolean;
  /** true quand le rendu utilise la data URL (cache ou fraîche). */
  usingDataUrl: boolean;
  /** GET CapacitorHttp a échoué après img_onerror. */
  resolutionFailed: boolean;
  onImageError: () => void;
};

/**
 * Profil / EditProfile iOS : URL publique Supabase en `<img src>`,
 * repli data URL via CapacitorHttp si WKWebView refuse le HTTPS.
 */
export function useIosCapacitorImageDisplay(
  preferredSrc: string | null | undefined,
): State {
  const preferred =
    typeof preferredSrc === "string" && preferredSrc.trim() ? preferredSrc.trim() : null;
  const iosEnabled =
    Boolean(preferred) && isRemoteHttpImageUrl(preferred) && shouldUseIosCapacitorImageFallback();

  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    iosEnabled && preferred ? getCachedCapacitorImageDataUrl(preferred) : null,
  );
  const [useDataUrl, setUseDataUrl] = useState(() => Boolean(dataUrl));
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionFailed, setResolutionFailed] = useState(false);
  const inflightRef = useRef<string | null>(null);
  const resolutionFailedRef = useRef(false);
  resolutionFailedRef.current = resolutionFailed;

  useEffect(() => {
    inflightRef.current = null;
    setIsResolving(false);
    setResolutionFailed(false);
    resolutionFailedRef.current = false;

    if (!iosEnabled || !preferred) {
      setDataUrl(null);
      setUseDataUrl(false);
      return;
    }

    const cached = getCachedCapacitorImageDataUrl(preferred);
    if (cached) {
      setDataUrl(cached);
      setUseDataUrl(true);
      return;
    }

    setDataUrl(null);
    setUseDataUrl(false);
  }, [iosEnabled, preferred]);

  const resolveViaCapacitorHttp = useCallback(() => {
    if (!iosEnabled || !preferred) return;

    const cached = getCachedCapacitorImageDataUrl(preferred);
    if (cached) {
      setDataUrl(cached);
      setUseDataUrl(true);
      setResolutionFailed(false);
      resolutionFailedRef.current = false;
      return;
    }

    if (inflightRef.current === preferred) return;
    inflightRef.current = preferred;
    setIsResolving(true);
    setResolutionFailed(false);
    resolutionFailedRef.current = false;

    void fetchCapacitorImageDataUrl(preferred).then((result) => {
      if (inflightRef.current === preferred) {
        inflightRef.current = null;
      }
      setIsResolving(false);
      if (result) {
        setDataUrl(result);
        setUseDataUrl(true);
        setResolutionFailed(false);
        resolutionFailedRef.current = false;
      } else {
        setResolutionFailed(true);
        resolutionFailedRef.current = true;
      }
    });
  }, [iosEnabled, preferred]);

  const onImageError = useCallback(() => {
    if (!iosEnabled) return;
    if (useDataUrl && dataUrl) return;
    if (resolutionFailedRef.current) return;
    resolveViaCapacitorHttp();
  }, [iosEnabled, useDataUrl, dataUrl, resolveViaCapacitorHttp]);

  const displaySrc =
    !preferred
      ? null
      : useDataUrl && dataUrl
        ? dataUrl
        : preferred;

  return {
    displaySrc,
    isResolving,
    usingDataUrl: useDataUrl && Boolean(dataUrl),
    resolutionFailed,
    onImageError,
  };
}
