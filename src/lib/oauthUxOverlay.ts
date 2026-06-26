import { useEffect, useSyncExternalStore } from "react";
import { isOauthProcessingLocked } from "./oauthCallbackLock";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import { logOAuthLoaderDiag } from "./oauthLoaderDiag";
import { releasePostAuthUi } from "./oauthUxRelease";
import { forceReleaseOAuthLoadingOnMove } from "./oauthLoadingScreenRelease";
import {
  getOAuthUxOverlayEpoch,
  subscribeOAuthUxOverlay,
} from "./oauthUxNotify";

/** True tant que l’utilisateur ne doit voir que l’écran SPLove OAuth (pas de routes / URLs techniques). */
let lastOAuthUxOverlayLogKey = "";

export { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";

export type OAuthUxOverlayContext = {
  hasSession?: boolean;
  pathname?: string;
  hash?: string;
};

function normalizeOAuthPathname(pathname: string | undefined): string {
  return (pathname ?? "").replace(/\/$/, "") || "/";
}

function isOnMoveRoute(pathname: string, hash: string): boolean {
  if (pathname === "/move") return true;
  return hash.startsWith("#/move");
}

function rawOAuthUxOverlayActive(): boolean {
  return (
    isOauthProcessingLocked() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
}

/** True si l’UI post-auth peut encore bloquer l’écran. */
export function shouldFinalizePostAuthUi(): boolean {
  return (
    isOauthProcessingLocked() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
}

function logOAuthUxOverlayActiveIfNeeded(active: boolean): void {
  if (!active) {
    lastOAuthUxOverlayLogKey = "";
    return;
  }
  const oauthLocked = isOauthProcessingLocked();
  const splashRequested = isPostOAuthSplashRequested();
  const splashActive = isPostOAuthSplashActive();
  const overlayMounted = isGoogleSignInOverlayMounted();
  const key = `${oauthLocked}|${splashRequested}|${splashActive}|${overlayMounted}`;
  if (key !== lastOAuthUxOverlayLogKey) {
    lastOAuthUxOverlayLogKey = key;
    logOAuthLoaderDiag("SplashPostAuth/oauthUxOverlay", "isOAuthUxOverlayActive=true", {
      oauthProcessingLocked: oauthLocked,
      postOAuthSplashRequested: splashRequested,
      postOAuthSplashActive: splashActive,
      googleSignInOverlayMounted: overlayMounted,
    });
  }
}

/** BootSplashGate : ne pas bloquer sur pathname /auth/callback résiduel hors flux OAuth actif. */
export function isOAuthCallbackRouteBlocking(pathname: string, hash: string): boolean {
  if (isOnMoveRoute(pathname, hash)) return false;
  if (hash.startsWith("#/auth/callback")) return true;
  if (!isOauthProcessingLocked()) return false;
  return pathname === "/auth/callback" || pathname.endsWith("/auth/callback");
}

export function isOAuthUxOverlayActive(ctx?: OAuthUxOverlayContext): boolean {
  const pathname = normalizeOAuthPathname(ctx?.pathname);
  const hash = ctx?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const hasSession = ctx?.hasSession === true;

  if (hasSession && isOnMoveRoute(pathname, hash)) {
    return false;
  }

  const active = rawOAuthUxOverlayActive();
  logOAuthUxOverlayActiveIfNeeded(active);
  return active;
}

/**
 * Réactive les gates React quand les verrous OAuth / splash changent.
 * Sur /move avec session : ne jamais bloquer sur SploveOAuthLoadingScreen.
 */
export function useOAuthUxOverlayActive(ctx?: OAuthUxOverlayContext): boolean {
  useSyncExternalStore(
    subscribeOAuthUxOverlay,
    getOAuthUxOverlayEpoch,
    getOAuthUxOverlayEpoch,
  );

  const pathname = normalizeOAuthPathname(ctx?.pathname);
  const hash = ctx?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const hasSession = ctx?.hasSession === true;
  const rawActive = rawOAuthUxOverlayActive();

  useEffect(() => {
    if (!hasSession || !isOnMoveRoute(pathname, hash) || !rawActive) return;
    console.log("OAUTH_LOADING_SCREEN_BLOCKED_BY_SESSION", {
      pathname,
      hash,
      hasSession,
      oauthProcessingLocked: isOauthProcessingLocked(),
      postOAuthSplashRequested: isPostOAuthSplashRequested(),
      postOAuthSplashActive: isPostOAuthSplashActive(),
      googleSignInOverlayMounted: isGoogleSignInOverlayMounted(),
    });
    forceReleaseOAuthLoadingOnMove("oauth_ux_overlay_move");
  }, [hasSession, pathname, hash, rawActive]);

  useEffect(() => {
    if (!hasSession || !shouldFinalizePostAuthUi()) return;
    if (!isOnMoveRoute(pathname, hash) && !isOauthProcessingLocked()) return;
    releasePostAuthUi("auth_success", isOnMoveRoute(pathname, hash) ? "/move" : undefined);
  }, [hasSession, pathname, hash]);

  return isOAuthUxOverlayActive(ctx);
}
