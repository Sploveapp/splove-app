import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isOAuthBrowserOpen } from "./oauthBrowserOpenState";
import { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";
import {
  isWebOAuthSplashActive,
  isWebOAuthSplashRequested,
} from "./webOAuthSplash";

/** URL technique OAuth visible dans le WebView — jamais montrée à l’utilisateur. */
const TECHNICAL_OAUTH_URL_RE =
  /supabase\.co|\/auth\/v1(?:\/|$|\?)|(?:^|[/?#])oauth|callback/i;

const TECHNICAL_HOST_RE =
  /supabase\.co|accounts\.google\.com|googleusercontent\.com|oauth|authorize|callback/i;

let urlGuardListenersInstalled = false;

function probeWindowLocation(href?: string, hash?: string): string {
  if (href != null || hash != null) {
    return `${href ?? ""}|${hash ?? ""}`;
  }
  if (typeof window === "undefined") return "";
  return `${window.location.href}|${window.location.hash}`;
}

/**
 * Garde fort : toute URL contenant supabase.co, /auth/v1, oauth ou callback
 * doit rester masquée par le splash « Connexion sécurisée… ».
 */
export function windowLocationHasTechnicalOAuthUrl(
  href?: string,
  hash?: string,
): boolean {
  const probe = probeWindowLocation(href, hash);
  if (!probe) return false;
  return TECHNICAL_OAUTH_URL_RE.test(probe);
}

export function isOnOAuthFinalAppRoute(pathname: string, hash: string): boolean {
  const path = (pathname ?? "").replace(/\/$/, "") || "/";
  const h = hash ?? "";
  if (path === "/move" || path === "/profile") return true;
  return h.startsWith("#/move") || h.startsWith("#/profile");
}

/** Écoute hash / visibilité pour réévaluer le masque dès que l’URL change. */
export function installOAuthTechnicalUrlGuardListeners(): void {
  if (urlGuardListenersInstalled || typeof window === "undefined") return;
  urlGuardListenersInstalled = true;
  const bump = () => notifyOAuthUxOverlayChanged();
  window.addEventListener("hashchange", bump);
  window.addEventListener("popstate", bump);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") bump();
  });
}

/** Test helper */
export function resetOAuthTechnicalUrlGuardListenersForTests(): void {
  urlGuardListenersInstalled = false;
}

/** True tant que l’UI doit masquer toute URL / page technique OAuth. */
export function isOAuthVisualMaskRequired(
  ctx?: { pathname?: string; hash?: string },
): boolean {
  const pathname = ctx?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  const hash =
    ctx?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");

  if (windowLocationHasTechnicalOAuthUrl()) return true;

  if (
    isOauthProcessingLocked() ||
    isOAuthBrowserOpen() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isWebOAuthSplashRequested() ||
    isWebOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  ) {
    return true;
  }

  if (isOnOAuthFinalAppRoute(pathname, hash)) return false;

  return false;
}

export function logOAuthMaskShow(reason: string, extra?: Record<string, unknown>): void {
  console.log("[OAuthMask] show", { reason, ...(extra ?? {}) });
}

export function logOAuthMaskHide(reason: string, extra?: Record<string, unknown>): void {
  console.log("[OAuthMask] hide", { reason, ...(extra ?? {}) });
}

export function logOAuthMaskProtectedTechnicalUrl(
  url: string,
  context: string,
  extra?: Record<string, unknown>,
): void {
  let host = "(invalid)";
  try {
    host = new URL(url).hostname;
  } catch {
    host = url.slice(0, 96);
  }
  if (!TECHNICAL_HOST_RE.test(url) && !TECHNICAL_HOST_RE.test(host)) return;
  console.log("[OAuthMask] protected_technical_url", {
    context,
    host,
    urlPrefix: url.split("?")[0]?.slice(0, 120) ?? url.slice(0, 120),
    ...(extra ?? {}),
  });
}
