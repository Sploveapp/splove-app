import { CapacitorHttp } from "@capacitor/core";
import { isGoogleOAuthNativePlatform } from "./authRedirect";
import { isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

const GOOGLE_ACCOUNTS_HOST = "accounts.google.com";
const RESOLVE_TIMEOUT_MS = 15_000;

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

function readLocationHeader(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;
  const raw = headers.location ?? headers.Location;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function resolveLocation(location: string, baseUrl: string): string {
  try {
    return new URL(location, baseUrl).href;
  } catch {
    return location;
  }
}

function acceptResolvedGoogleOAuthUrl(candidate: string): string | null {
  if (isCompleteGoogleOAuthAuthorizeUrl(candidate)) {
    return candidate;
  }
  if (import.meta.env.DEV && isGoogleAccountsOAuthUrl(candidate)) {
    console.warn("OAUTH_RESOLVE_GOOGLE_URL_INCOMPLETE");
  }
  return null;
}

/**
 * Résout l’URL Google OAuth via GET natif sur /authorize (hors navigateur visible).
 * PKCE : signInWithOAuth a déjà stocké code_verifier ; l’URL contient code_challenge.
 * Ne rappelle jamais signInWithOAuth.
 * Retourne null si l’URL Google est absente ou incomplète (→ flux Supabase /authorize).
 */
export async function resolveGoogleOAuthBrowserUrl(
  supabaseAuthorizeUrl: string,
): Promise<string | null> {
  if (!isGoogleOAuthNativePlatform()) return null;
  if (!isSupabaseGoogleAuthorizeUrl(supabaseAuthorizeUrl)) return null;

  if (import.meta.env.DEV) {
    console.log("OAUTH_RESOLVE_AUTHORIZE_START");
  }

  try {
    const response = await Promise.race([
      CapacitorHttp.request({
        url: supabaseAuthorizeUrl,
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
        responseType: "text",
        connectTimeout: RESOLVE_TIMEOUT_MS,
        readTimeout: RESOLVE_TIMEOUT_MS,
      }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("OAUTH_RESOLVE_TIMEOUT")), RESOLVE_TIMEOUT_MS);
      }),
    ]);

    const status = response.status;
    const location = readLocationHeader(response.headers as Record<string, unknown>);
    const responseUrl = typeof response.url === "string" ? response.url : null;

    if (location) {
      const resolved = resolveLocation(location, supabaseAuthorizeUrl);
      const accepted = acceptResolvedGoogleOAuthUrl(resolved);
      if (accepted) {
        if (import.meta.env.DEV) {
          console.log("OAUTH_RESOLVE_GOOGLE_URL_OK", { via: "location_header" });
        }
        return accepted;
      }
    }

    if (responseUrl) {
      const accepted = acceptResolvedGoogleOAuthUrl(responseUrl);
      if (accepted) {
        if (import.meta.env.DEV) {
          console.log("OAUTH_RESOLVE_GOOGLE_URL_OK", { via: "response_url", status });
        }
        return accepted;
      }
    }

    if (import.meta.env.DEV) {
      console.warn("OAUTH_RESOLVE_NO_GOOGLE_URL", { status, hasLocation: Boolean(location) });
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("OAUTH_RESOLVE_FAIL", e instanceof Error ? e.message : e);
    }
  }

  return null;
}
