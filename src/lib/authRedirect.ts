/**
 * URLs passées à Supabase (`redirectTo`, recovery, OAuth) doivent refléter l’origine
 * actuelle du navigateur (localhost en dev, domaine Render en prod). Ne pas figer
 * de domaine de déploiement dans le code.
 */
export function authRedirectBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/** Return URL for Supabase OAuth `redirectTo` (must match an allowed redirect in the Supabase dashboard). */
export function oauthRedirectUrl(): string {
  // Exact shape required for PKCE return to the same origin as the SPA.
  return `${window.location.origin}/auth/callback`;
}

/** Lien dans l’email « mot de passe oublié ». */
export function passwordRecoveryRedirectUrl(): string {
  return `${authRedirectBase()}#/reset-password`;
}

/** HashRouter: route lives in `location.hash` (`#/auth/callback?...`); or full path for direct loads. */
export function isAuthCallbackPath(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/auth/callback" || window.location.pathname.endsWith("/auth/callback")) {
    return true;
  }
  return /^#\/auth\/callback([/?]|$)/.test(window.location.hash);
}
