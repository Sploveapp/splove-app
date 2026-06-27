import { CapacitorHttp } from "@capacitor/core";
import { env } from "./env";
import {
  hasRequiredGoogleOAuthParams,
  isCompleteGoogleOAuthAuthorizeUrl,
  isGoogleAccountsOAuthUrl,
} from "./oauthGoogleBrowserUrl";
import { isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

export type IosOAuthBrowserTargetStrategy = "google_direct" | "resolve_failed";

export type IosOAuthBrowserTarget = {
  url: string | null;
  strategy: IosOAuthBrowserTargetStrategy;
  /** Host de l’URL Supabase /authorize d’origine. */
  sourceAuthorizeHost: string;
  /** Host réellement ouvert dans SFSafariViewController (accounts.google.com si ok). */
  openHost: string;
  googleVisible: boolean;
  reason?: string;
};

const MAX_REDIRECT_HOPS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid)";
  }
}

export function isSupabaseAuthHost(url: string): boolean {
  try {
    return /\.supabase\.co$/i.test(new URL(url).hostname);
  } catch {
    return /\.supabase\.co/i.test(url);
  }
}

/** iOS : Browser.open autorisé uniquement sur accounts.google.com. */
export function isIosBrowserOpenAllowed(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  if (isSupabaseAuthHost(url)) return false;
  if (isSupabaseGoogleAuthorizeUrl(url)) return false;
  return isGoogleAccountsOAuthUrl(url);
}

function locationHeader(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;
  const raw = headers.Location ?? headers.location;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function toAbsoluteUrl(location: string, base: string): string {
  try {
    return new URL(location, base).href;
  } catch {
    return location;
  }
}

/** URL Google utilisable pour Browser.open (PKCE state conservé dans state). */
export function isUsableGoogleOAuthAuthorizeUrl(url: string): boolean {
  if (isCompleteGoogleOAuthAuthorizeUrl(url)) return true;
  if (!isGoogleAccountsOAuthUrl(url)) return false;
  if (hasRequiredGoogleOAuthParams(url)) return true;
  try {
    const parsed = new URL(url);
    return Boolean(
      parsed.searchParams.get("client_id")?.trim() &&
        parsed.searchParams.get("redirect_uri")?.trim() &&
        parsed.searchParams.get("state")?.trim(),
    );
  } catch {
    return false;
  }
}

function authorizeResolveHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };
  const anon = env.supabaseAnonKey?.trim();
  if (anon) {
    headers.apikey = anon;
    headers.Authorization = `Bearer ${anon}`;
  }
  return headers;
}

async function fetchRedirectHop(url: string): Promise<{
  status: number;
  location: string | null;
  responseUrl: string | null;
}> {
  const res = await CapacitorHttp.request({
    url,
    method: "GET",
    disableRedirects: true,
    headers: authorizeResolveHeaders(),
  });

  const responseUrl = typeof res.url === "string" && res.url.trim() ? res.url.trim() : null;

  return {
    status: res.status ?? 0,
    location: locationHeader(res.headers as Record<string, unknown> | undefined),
    responseUrl,
  };
}

/**
 * Suit uniquement les redirects 301/302/303/307/308 jusqu’à accounts.google.com.
 * Ne charge jamais le corps Supabase dans le navigateur système.
 */
export async function resolveGoogleAuthorizeUrlFromSupabase(
  supabaseAuthorizeUrl: string,
): Promise<string | null> {
  let current = supabaseAuthorizeUrl.trim();
  if (!isSupabaseGoogleAuthorizeUrl(current)) return null;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    console.log("IOS_OAUTH_RESOLVE_HOP", { hop, host: hostFromUrl(current) });

    const { status, location, responseUrl } = await fetchRedirectHop(current);

    if (responseUrl && isUsableGoogleOAuthAuthorizeUrl(responseUrl)) {
      console.log("IOS_OAUTH_RESOLVE_GOOGLE", {
        hop,
        host: hostFromUrl(responseUrl),
        via: "response_url",
      });
      return responseUrl;
    }

    if (!location || !REDIRECT_STATUSES.has(status)) {
      console.log("IOS_OAUTH_RESOLVE_STOP", { hop, status, reason: "no_redirect" });
      break;
    }

    const next = toAbsoluteUrl(location, current);
    console.log("IOS_OAUTH_RESOLVE_REDIRECT", {
      hop,
      status,
      from: hostFromUrl(current),
      to: hostFromUrl(next),
    });

    if (isUsableGoogleOAuthAuthorizeUrl(next)) {
      console.log("IOS_OAUTH_RESOLVE_GOOGLE", { hop, host: hostFromUrl(next), via: "location" });
      return next;
    }

    if (isSupabaseAuthHost(next) || isSupabaseGoogleAuthorizeUrl(next)) {
      current = next;
      continue;
    }

    if (REDIRECT_STATUSES.has(status)) {
      current = next;
      continue;
    }

    break;
  }

  const followed = await fetchGoogleUrlFollowingRedirects(supabaseAuthorizeUrl.trim());
  if (followed) return followed;

  return null;
}

/** Repli HTTP natif : suivre les 302 côté app sans ouvrir le navigateur. */
async function fetchGoogleUrlFollowingRedirects(supabaseAuthorizeUrl: string): Promise<string | null> {
  try {
    const res = await CapacitorHttp.request({
      url: supabaseAuthorizeUrl,
      method: "GET",
      headers: authorizeResolveHeaders(),
    });
    const responseUrl = typeof res.url === "string" ? res.url.trim() : "";
    if (responseUrl && isUsableGoogleOAuthAuthorizeUrl(responseUrl)) {
      console.log("IOS_OAUTH_RESOLVE_GOOGLE", {
        via: "follow_redirects",
        host: hostFromUrl(responseUrl),
        status: res.status ?? 0,
      });
      return responseUrl;
    }
    const location = locationHeader(res.headers as Record<string, unknown> | undefined);
    if (location) {
      const absolute = toAbsoluteUrl(location, supabaseAuthorizeUrl);
      if (isUsableGoogleOAuthAuthorizeUrl(absolute)) {
        console.log("IOS_OAUTH_RESOLVE_GOOGLE", {
          via: "follow_redirects_location",
          host: hostFromUrl(absolute),
        });
        return absolute;
      }
    }
  } catch (e) {
    console.log("IOS_OAUTH_RESOLVE_FOLLOW_ERROR", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

function buildResolveFailedTarget(
  supabaseAuthorizeUrl: string,
  reason: string,
): IosOAuthBrowserTarget {
  return {
    url: null,
    strategy: "resolve_failed",
    sourceAuthorizeHost: hostFromUrl(supabaseAuthorizeUrl),
    openHost: "(none)",
    googleVisible: false,
    reason,
  };
}

function buildGoogleDirectTarget(
  supabaseAuthorizeUrl: string,
  googleUrl: string,
): IosOAuthBrowserTarget {
  return {
    url: googleUrl,
    strategy: "google_direct",
    sourceAuthorizeHost: hostFromUrl(supabaseAuthorizeUrl),
    openHost: hostFromUrl(googleUrl),
    googleVisible: true,
  };
}

/** iOS : ne retourne une URL que pour accounts.google.com — jamais Supabase ni page start. */
export async function resolveIosGoogleOAuthBrowserTarget(
  supabaseAuthorizeUrl: string,
): Promise<IosOAuthBrowserTarget> {
  const trimmed = supabaseAuthorizeUrl.trim();

  try {
    const googleUrl = await resolveGoogleAuthorizeUrlFromSupabase(trimmed);
    if (googleUrl && isIosBrowserOpenAllowed(googleUrl)) {
      return buildGoogleDirectTarget(trimmed, googleUrl);
    }
    if (googleUrl && !isIosBrowserOpenAllowed(googleUrl)) {
      console.log("IOS_BROWSER_OPEN_BLOCKED_SUPABASE", { host: hostFromUrl(googleUrl) });
      return buildResolveFailedTarget(trimmed, "resolved_non_google_url");
    }
  } catch (e) {
    console.log("IOS_GOOGLE_OAUTH_RESOLVE_ERROR", {
      message: e instanceof Error ? e.message : String(e),
    });
    return buildResolveFailedTarget(trimmed, "resolve_http_error");
  }

  return buildResolveFailedTarget(trimmed, "google_url_unresolved");
}

/** Dernière barrière avant Browser.open — rejette toute URL non-Google. */
export function ensureIosBrowserNeverOpensSupabase(
  target: IosOAuthBrowserTarget,
  supabaseAuthorizeUrl: string,
): IosOAuthBrowserTarget {
  if (target.strategy === "google_direct" && target.url && isIosBrowserOpenAllowed(target.url)) {
    return target;
  }
  if (target.url && (isSupabaseAuthHost(target.url) || isSupabaseGoogleAuthorizeUrl(target.url))) {
    console.log("IOS_BROWSER_OPEN_BLOCKED_SUPABASE", { host: hostFromUrl(target.url) });
  }
  return buildResolveFailedTarget(
    supabaseAuthorizeUrl,
    target.reason ?? "browser_open_not_google",
  );
}

export function logIosOAuthBrowserTarget(
  target: IosOAuthBrowserTarget,
  supabaseAuthorizeUrl?: string,
): void {
  const sourceHost = supabaseAuthorizeUrl
    ? hostFromUrl(supabaseAuthorizeUrl)
    : target.sourceAuthorizeHost;

  console.log("IOS_BROWSER_INITIAL_URL", sourceHost);

  if (target.googleVisible && target.openHost === "accounts.google.com") {
    console.log("IOS_BROWSER_VISIBLE_HOST", "accounts.google.com");
    console.log("IOS_BROWSER_GOOGLE_VISIBLE", true);
  } else {
    console.log("IOS_BROWSER_VISIBLE_HOST", target.openHost);
    console.log("IOS_SUPABASE_FLASH_DETECTED", {
      blocked: true,
      strategy: target.strategy,
      reason: target.reason ?? "not_google",
    });
  }

  console.log("IOS_BROWSER_OPEN_TARGET", {
    strategy: target.strategy,
    sourceHost,
    openHost: target.openHost,
    googleVisible: target.googleVisible,
    allowed: target.url ? isIosBrowserOpenAllowed(target.url) : false,
  });
}
