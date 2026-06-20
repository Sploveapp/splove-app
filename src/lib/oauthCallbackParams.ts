import { supabase } from "./supabase";
import { isNativeOAuthCallbackUrl } from "./authRedirect";
import { formatExchangeCodeLog, formatSetSessionLog } from "./oauthLogSanitize";
import { logPkceStorageKeys } from "./oauthPkceDiagnostics";

/** OAuth params extracted from callback URL (PKCE code or implicit tokens). */
export type OAuthCallbackParams = {
  hasCode: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

export type ResolvedOAuthCallbackParams = OAuthCallbackParams & {
  source: string;
};

function appendSearchParams(target: URLSearchParams, raw: string): void {
  const trimmed = raw.replace(/^[?#]/, "").trim();
  if (!trimmed || !trimmed.includes("=")) return;
  const sp = new URLSearchParams(trimmed);
  sp.forEach((value, key) => {
    target.set(key, value);
  });
}

/**
 * Parse `code`, `access_token`, `refresh_token` from query, hash, or custom scheme URL.
 * Supports: splove://auth/callback?code=…, splove://login-callback (legacy), com.splove.app://auth/callback.
 */
export function parseOAuthCallbackParams(inputUrl: string): OAuthCallbackParams {
  const url = inputUrl.trim();
  const merged = new URLSearchParams();

  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");

  if (queryStart !== -1) {
    const end = hashStart !== -1 && hashStart > queryStart ? hashStart : url.length;
    appendSearchParams(merged, url.slice(queryStart + 1, end));
  }

  if (hashStart !== -1) {
    let hashPart = url.slice(hashStart + 1);
    const routePrefix = hashPart.match(/^\/?(?:auth\/callback|login-callback)\/?/i);
    if (routePrefix) {
      hashPart = hashPart.slice(routePrefix[0].length);
    }
    appendSearchParams(merged, hashPart);
  }

  if ([...merged.keys()].length === 0) {
    appendSearchParams(merged, url);
  }

  const code = merged.get("code");
  const accessToken = merged.get("access_token");
  const refreshToken = merged.get("refresh_token");

  return {
    hasCode: Boolean(code),
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    code,
    accessToken,
    refreshToken,
  };
}

function mergeParams(a: OAuthCallbackParams, b: OAuthCallbackParams): OAuthCallbackParams {
  return {
    hasCode: a.hasCode || b.hasCode,
    hasAccessToken: a.hasAccessToken || b.hasAccessToken,
    hasRefreshToken: a.hasRefreshToken || b.hasRefreshToken,
    code: a.code ?? b.code,
    accessToken: a.accessToken ?? b.accessToken,
    refreshToken: a.refreshToken ?? b.refreshToken,
  };
}

export function mergeOAuthCallbackParams(primaryUrl: string, secondaryUrl: string): OAuthCallbackParams {
  return mergeParams(parseOAuthCallbackParams(primaryUrl), parseOAuthCallbackParams(secondaryUrl));
}

type OAuthParamSource = { label: string; raw: string };

/**
 * Collect OAuth params from deep link stash, window URL, hash, search, and HashRouter location.
 * Handles `#/auth/callback?access_token=…` (Capacitor + HashRouter).
 */
export function resolveOAuthCallbackParams(options?: {
  storedDeepLinkUrl?: string | null;
  routerSearch?: string;
  routerHash?: string;
}): ResolvedOAuthCallbackParams {
  const sources: OAuthParamSource[] = [];
  const usedLabels: string[] = [];

  if (options?.storedDeepLinkUrl) {
    sources.push({ label: "deep_link", raw: options.storedDeepLinkUrl });
  }

  if (typeof window !== "undefined") {
    const { href, hash, search, pathname } = window.location;
    sources.push({ label: "location.href", raw: href });
    if (search) sources.push({ label: "location.search", raw: search });
    if (hash) {
      sources.push({ label: "location.hash", raw: hash });
      sources.push({ label: "location.pathname+hash", raw: `${pathname}${hash}` });
    }
  }

  if (options?.routerSearch) {
    sources.push({ label: "router.search", raw: options.routerSearch });
  }
  if (options?.routerHash) {
    sources.push({ label: "router.hash", raw: options.routerHash });
  }

  let merged: OAuthCallbackParams = {
    hasCode: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    code: null,
    accessToken: null,
    refreshToken: null,
  };

  for (const { label, raw } of sources) {
    if (!raw?.trim()) continue;
    const parsed = parseOAuthCallbackParams(raw);
    const before = merged.accessToken;
    merged = mergeParams(merged, parsed);
    if (!before && merged.accessToken) usedLabels.push(`${label}:access_token`);
    if (merged.refreshToken && usedLabels.every((s) => !s.includes(`${label}:refresh`))) {
      if (parsed.refreshToken) usedLabels.push(`${label}:refresh_token`);
    }
    if (merged.code && usedLabels.every((s) => !s.includes(`${label}:code`))) {
      if (parsed.code) usedLabels.push(`${label}:code`);
    }
  }

  return {
    ...merged,
    source: usedLabels.length > 0 ? usedLabels.join(", ") : "none",
  };
}

/** Hash route with OAuth query preserved for HashRouter + detectSessionInUrl fallback. */
export function authCallbackHashRouteFromOAuthUrl(oauthUrl: string): string {
  const params = parseOAuthCallbackParams(oauthUrl);
  if (params.hasCode && params.code) {
    return `#/auth/callback?code=${encodeURIComponent(params.code)}`;
  }
  if (params.hasAccessToken && params.accessToken) {
    const q = new URLSearchParams();
    q.set("access_token", params.accessToken);
    if (params.refreshToken) q.set("refresh_token", params.refreshToken);
    return `#/auth/callback?${q.toString()}`;
  }
  return "#/auth/callback";
}

/** Establish Supabase session from OAuth callback (implicit tokens or PKCE code). */
export async function establishSupabaseSessionFromOAuthCallbackUrl(callbackUrl: string): Promise<{
  ok: boolean;
  method: string;
  error: string | null;
}> {
  const windowHref = typeof window !== "undefined" ? window.location.href : "";
  // Deep link natif : ne pas fusionner location.href (évite double parse / mauvais code).
  const params = isNativeOAuthCallbackUrl(callbackUrl)
    ? parseOAuthCallbackParams(callbackUrl)
    : mergeOAuthCallbackParams(callbackUrl, windowHref);

  console.log("[AuthCallback] parsed", {
    hasCode: params.hasCode,
    hasAccessToken: params.hasAccessToken,
    hasRefreshToken: params.hasRefreshToken,
  });

  if (params.hasAccessToken && params.accessToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken ?? "",
    });
    if (error) {
      console.log("[AuthCallback] setSession result", formatSetSessionLog(null, error));
      return { ok: false, method: "setSession", error: error.message };
    }
    const ok = Boolean(data.session?.user?.id);
    console.log("[AuthCallback] setSession result", formatSetSessionLog(data, null));
    return { ok, method: "setSession", error: ok ? null : "setSession returned no user" };
  }

  if (params.hasCode && params.code) {
    // Une seule tentative : auth_code = code OAuth uniquement.
    // Passer splove://… en entier échoue et supprime splove-auth-code-verifier (GoTrueClient).
    await logPkceStorageKeys("PKCE_KEYS_BEFORE_EXCHANGE");
    console.log("EXCHANGE_START");

    const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
    if (!exchanged.error && exchanged.data.session?.user?.id) {
      console.log("EXCHANGE_SUCCESS");
      console.log("[AuthCallback] exchangeCodeForSession", formatExchangeCodeLog(exchanged));
      await logPkceStorageKeys("PKCE_KEYS_AFTER_EXCHANGE");
      return { ok: true, method: "exchangeCodeForSession(code)", error: null };
    }

    const failMessage = exchanged.error?.message ?? "exchange returned no session";
    console.log("EXCHANGE_FAIL", { message: failMessage });
    console.log("[AuthCallback] exchangeCodeForSession", formatExchangeCodeLog(exchanged));
    await logPkceStorageKeys("PKCE_KEYS_AFTER_EXCHANGE");
    return { ok: false, method: "exchangeCodeForSession", error: failMessage };
  }

  return { ok: false, method: "none", error: "no code or access_token in callback URL" };
}
