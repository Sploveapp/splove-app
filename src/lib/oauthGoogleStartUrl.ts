/** Route HashRouter de la page intermédiaire OAuth Google (Capacitor Browser). */
export const OAUTH_GOOGLE_START_PATH = "/oauth/google/start";

const SUPABASE_AUTHORIZE_RE =
  /^https:\/\/[^/]+\.supabase\.co\/auth\/v1\/authorize(?:\?|$)/i;

export function isOAuthGoogleStartPath(pathname: string): boolean {
  const norm = pathname.replace(/\/$/, "") || "/";
  return norm === OAUTH_GOOGLE_START_PATH;
}

/** URL Supabase authorize déjà émise par signInWithOAuth (code_challenge inclus). */
export function isSupabaseGoogleAuthorizeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!SUPABASE_AUTHORIZE_RE.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    const provider = parsed.searchParams.get("provider");
    return provider === "google" || /\/authorize\/google/i.test(trimmed);
  } catch {
    return /provider=google/i.test(trimmed);
  }
}

/**
 * Page intermédiaire SPLove dans SFSafariViewController — ne régénère pas PKCE.
 * Le code_verifier reste dans Preferences (WKWebView app) ; seul le challenge est dans auth_url.
 */
export function buildOAuthGoogleStartBrowserUrl(supabaseAuthorizeUrl: string): string {
  const trimmed = supabaseAuthorizeUrl.trim();
  const params = new URLSearchParams();
  params.set("auth_url", trimmed);
  const origin =
    typeof window !== "undefined" ? window.location.origin || "https://localhost" : "https://localhost";
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${origin}${normalizedBase}#${OAUTH_GOOGLE_START_PATH}?${params.toString()}`;
}

export function parseOAuthGoogleStartAuthUrl(
  search: string,
  hash: string,
): string | null {
  const fromSearch = new URLSearchParams(search).get("auth_url");
  if (fromSearch?.trim()) return fromSearch.trim();

  const hashQueryStart = hash.indexOf("?");
  if (hashQueryStart === -1) return null;
  const fromHash = new URLSearchParams(hash.slice(hashQueryStart + 1)).get("auth_url");
  return fromHash?.trim() ?? null;
}
