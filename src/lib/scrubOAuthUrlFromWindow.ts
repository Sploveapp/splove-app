import { isNativeCapacitorApp } from "./authRedirect";
import { setOauthProcessingLock } from "./oauthCallbackLock";

const OAUTH_SECRET_IN_URL =
  /access_token|refresh_token|provider_token|(?:^|[?#&])code=|(?:^|[?#&])state=/i;

/** True si l’URL du WebView contient des secrets OAuth (ne doit jamais être visible). */
export function windowUrlContainsOAuthSecrets(): boolean {
  if (typeof window === "undefined") return false;
  const raw = `${window.location.search}${window.location.hash}`;
  return OAUTH_SECRET_IN_URL.test(raw);
}

export function isAuthCallbackHashVisible(): boolean {
  if (typeof window === "undefined") return false;
  return /^#\/auth\/callback([/?]|$)/i.test(window.location.hash || "");
}

/**
 * Retire code / tokens de l’URL visible (hash uniquement sur Capacitor iOS).
 * Appelé avant tout rendu React et immédiatement au retour deep link.
 */
export function scrubOAuthTokensFromNativeWindow(safeHash = "#/auth"): void {
  if (typeof window === "undefined") return;

  const needsScrub =
    windowUrlContainsOAuthSecrets() || isAuthCallbackHashVisible();
  if (!needsScrub) return;

  if (isNativeCapacitorApp()) {
    if (window.location.hash !== safeHash) {
      window.location.hash = safeHash;
    }
    return;
  }

  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  window.history.replaceState(null, "", `${base}${safeHash.startsWith("#") ? safeHash : `#${safeHash}`}`);
}

/** Premier paint : verrou + hash sûr si reload sur callback OAuth. */
export function scrubOAuthUrlFromWindowEarly(): void {
  if (typeof window === "undefined") return;
  if (!windowUrlContainsOAuthSecrets() && !isAuthCallbackHashVisible()) return;
  setOauthProcessingLock();
  scrubOAuthTokensFromNativeWindow("#/auth");
}
