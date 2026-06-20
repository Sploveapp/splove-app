import { CapacitorHttp } from "@capacitor/core";
import { isGoogleOAuthNativePlatform } from "./authRedirect";
import { isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

const GOOGLE_ACCOUNTS_HOST = "accounts.google.com";
const RESOLVE_TIMEOUT_MS = 15_000;

export function isGoogleAccountsOAuthUrl(url: string): boolean {
  try {
    return new URL(url).hostname === GOOGLE_ACCOUNTS_HOST;
  } catch {
    return /^https:\/\/accounts\.google\.com\//i.test(url);
  }
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

/**
 * Résout l’URL Google OAuth via GET natif sur /authorize (hors navigateur visible).
 * PKCE : signInWithOAuth a déjà stocké code_verifier ; l’URL contient code_challenge.
 * Ne rappelle jamais signInWithOAuth.
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
      if (isGoogleAccountsOAuthUrl(resolved)) {
        if (import.meta.env.DEV) {
          console.log("OAUTH_RESOLVE_GOOGLE_URL_OK", { via: "location_header" });
        }
        return resolved;
      }
    }

    if (responseUrl && isGoogleAccountsOAuthUrl(responseUrl)) {
      if (import.meta.env.DEV) {
        console.log("OAUTH_RESOLVE_GOOGLE_URL_OK", { via: "response_url", status });
      }
      return responseUrl;
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
