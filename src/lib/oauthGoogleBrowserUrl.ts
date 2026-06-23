const GOOGLE_ACCOUNTS_HOST = "accounts.google.com";

/** Paramètres OAuth minimum requis pour ouvrir accounts.google.com directement. */
export const REQUIRED_GOOGLE_OAUTH_PARAMS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
] as const;

export function isGoogleAccountsOAuthUrl(url: string): boolean {
  try {
    return new URL(url).hostname === GOOGLE_ACCOUNTS_HOST;
  } catch {
    return /^https:\/\/accounts\.google\.com\//i.test(url);
  }
}

/** True si l’URL Google contient tous les paramètres OAuth requis pour un authorize complet. */
export function hasRequiredGoogleOAuthParams(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== GOOGLE_ACCOUNTS_HOST) return false;
    return REQUIRED_GOOGLE_OAUTH_PARAMS.every((key) => {
      const value = parsed.searchParams.get(key);
      return typeof value === "string" && value.trim().length > 0;
    });
  } catch {
    return false;
  }
}

/** Host Google + paramètres OAuth complets — seule URL safe pour Browser.open direct. */
export function isCompleteGoogleOAuthAuthorizeUrl(url: string): boolean {
  return isGoogleAccountsOAuthUrl(url) && hasRequiredGoogleOAuthParams(url);
}

