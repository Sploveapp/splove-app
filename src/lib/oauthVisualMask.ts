import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isOAuthBrowserOpen } from "./oauthBrowserOpenState";

const TECHNICAL_HOST_RE =
  /supabase\.co|accounts\.google\.com|googleusercontent\.com|oauth|authorize|callback/i;

/** True tant que l’UI doit masquer toute URL / page technique OAuth. */
export function isOAuthVisualMaskRequired(): boolean {
  return (
    isOauthProcessingLocked() ||
    isOAuthBrowserOpen() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
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
