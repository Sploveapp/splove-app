import { CapacitorHttp } from "@capacitor/core";
import {
  hasRequiredGoogleOAuthParams,
  isCompleteGoogleOAuthAuthorizeUrl,
  isGoogleAccountsOAuthUrl,
} from "./oauthGoogleBrowserUrl";
import { buildOAuthGoogleStartBrowserUrl, isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

export type IosOAuthBrowserTargetStrategy = "google_direct" | "splove_start_page";

export type IosOAuthBrowserTarget = {
  url: string;
  strategy: IosOAuthBrowserTargetStrategy;
  /** Host de l’URL Supabase /authorize d’origine. */
  sourceAuthorizeHost: string;
  /** Host réellement ouvert dans SFSafariViewController. */
  openHost: string;
  supabaseFlashRisk: boolean;
  googleVisible: boolean;
};

const MAX_REDIRECT_HOPS = 10;
const REDIRECT_STATUSES = new Set([302, 303, 307, 308]);

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid)";
  }
}

function isSupabaseAuthHost(url: string): boolean {
  try {
    return /\.supabase\.co$/i.test(new URL(url).hostname);
  } catch {
    return /\.supabase\.co/i.test(url);
  }
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

async function fetchRedirectHop(url: string): Promise<{
  status: number;
  location: string | null;
  responseUrl: string | null;
}> {
  const res = await CapacitorHttp.request({
    url,
    method: "GET",
    disableRedirects: true,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });

  const responseUrl = typeof res.url === "string" && res.url.trim() ? res.url.trim() : null;

  return {
    status: res.status ?? 0,
    location: locationHeader(res.headers as Record<string, unknown> | undefined),
    responseUrl,
  };
}

/**
 * Suit uniquement les redirects 302/303/307/308 jusqu’à accounts.google.com.
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
      console.log("IOS_OAUTH_RESOLVE_GOOGLE", { hop, host: hostFromUrl(responseUrl), via: "response_url" });
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

  return null;
}

function buildSploveStartFallback(supabaseAuthorizeUrl: string): IosOAuthBrowserTarget {
  const trimmed = supabaseAuthorizeUrl.trim();
  const startUrl = buildOAuthGoogleStartBrowserUrl(trimmed);
  return {
    url: startUrl,
    strategy: "splove_start_page",
    sourceAuthorizeHost: hostFromUrl(trimmed),
    openHost: hostFromUrl(startUrl),
    supabaseFlashRisk: true,
    googleVisible: false,
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
    supabaseFlashRisk: false,
    googleVisible: true,
  };
}

/** iOS : ne jamais retourner une URL *.supabase.co pour Browser.open. */
export async function resolveIosGoogleOAuthBrowserTarget(
  supabaseAuthorizeUrl: string,
): Promise<IosOAuthBrowserTarget> {
  const trimmed = supabaseAuthorizeUrl.trim();

  try {
    const googleUrl = await resolveGoogleAuthorizeUrlFromSupabase(trimmed);
    if (googleUrl && !isSupabaseAuthHost(googleUrl)) {
      return buildGoogleDirectTarget(trimmed, googleUrl);
    }
  } catch (e) {
    console.log("IOS_GOOGLE_OAUTH_RESOLVE_ERROR", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return buildSploveStartFallback(trimmed);
}

/** Dernière barrière : jamais Browser.open sur supabase.co (iOS). */
export function ensureIosBrowserNeverOpensSupabase(
  target: IosOAuthBrowserTarget,
  supabaseAuthorizeUrl: string,
): IosOAuthBrowserTarget {
  if (
    isSupabaseAuthHost(target.url) ||
    isSupabaseGoogleAuthorizeUrl(target.url)
  ) {
    console.log("IOS_BROWSER_OPEN_BLOCKED_SUPABASE", { host: hostFromUrl(target.url) });
    return buildSploveStartFallback(supabaseAuthorizeUrl);
  }
  return target;
}

export function logIosOAuthBrowserTarget(
  target: IosOAuthBrowserTarget,
  supabaseAuthorizeUrl?: string,
): void {
  const sourceHost = supabaseAuthorizeUrl
    ? hostFromUrl(supabaseAuthorizeUrl)
    : target.sourceAuthorizeHost;

  console.log("IOS_BROWSER_INITIAL_URL", sourceHost);
  console.log("IOS_BROWSER_VISIBLE_HOST", target.openHost);

  if (target.googleVisible) {
    console.log("IOS_BROWSER_GOOGLE_VISIBLE", true);
  }

  if (target.supabaseFlashRisk) {
    console.log("IOS_SUPABASE_FLASH_DETECTED", {
      strategy: target.strategy,
      phase: "browser_open",
    });
  }

  console.log("IOS_BROWSER_OPEN_TARGET", {
    strategy: target.strategy,
    sourceHost,
    openHost: target.openHost,
    googleVisible: target.googleVisible,
    isSupabaseOpen: isSupabaseAuthHost(target.url),
  });
}
