/** Retour haptique léger — Web Vibration API (Capacitor WebView inclus). */
export function triggerSploveHeartHaptic(premium = false): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(premium ? [10, 36, 14] : 14);
  } catch {
    /* ignore */
  }
}
