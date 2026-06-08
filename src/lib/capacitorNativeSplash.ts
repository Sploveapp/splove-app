import { SplashScreen } from "@capacitor/splash-screen";
import { isNativeCapacitorApp } from "./authRedirect";

let nativeSplashHidden = false;

/**
 * Masque le splash natif Capacitor dès que React est prêt (WKWebView visible).
 * Idempotent — safe à rappeler depuis AuthCallback / PostLoginProfileSplash.
 */
export function hideCapacitorSplashWhenReady(): void {
  if (!isNativeCapacitorApp() || nativeSplashHidden) return;

  const hide = () => {
    if (nativeSplashHidden) return;
    nativeSplashHidden = true;
    void SplashScreen.hide({ fadeOutDuration: 220 }).then(
      () => console.log("[capacitor] SplashScreen.hide done"),
      (e) => console.warn("[capacitor] SplashScreen.hide", e),
    );
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(hide));
  } else {
    window.setTimeout(hide, 16);
  }
}
