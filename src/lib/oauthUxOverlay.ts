import { useEffect, useSyncExternalStore } from "react";
import { isOauthProcessingLocked } from "./oauthCallbackLock";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import { isOAuthBrowserOpen } from "./oauthBrowserOpenState";
import { logOAuthLoaderDiag } from "./oauthLoaderDiag";
import { releasePostAuthUi } from "./oauthUxRelease";
import { forceReleaseOAuthLoadingOnMove } from "./oauthLoadingScreenRelease";
import {
  isWebOAuthSplashActive,
  isWebOAuthSplashRequested,
} from "./webOAuthSplash";
import {
  getOAuthUxOverlayEpoch,
  subscribeOAuthUxOverlay,
} from "./oauthUxNotify";
import {
  installOAuthTechnicalUrlGuardListeners,
  isOAuthVisualMaskRequired,
  isOnOAuthFinalAppRoute,
  logOAuthMaskProtectedTechnicalUrl,
  windowLocationHasTechnicalOAuthUrl,
} from "./oauthVisualMask";

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
    isOAuthBrowserOpen() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isWebOAuthSplashRequested() ||
    isWebOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
}

/** True si l’UI post-auth peut encore bloquer l’écran. */
export function shouldFinalizePostAuthUi(): boolean {
  return (
    isOauthProcessingLocked() ||
    isOAuthBrowserOpen() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isWebOAuthSplashRequested() ||
    isWebOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
}

function logOAuthUxOverlayActiveIfNeeded(active: boolean): void {
  if (!active) {
    lastOAuthUxOverlayLogKey = "";
    return;
  }
  const oauthLocked = isOauthProcessingLocked();
  const browserOpen = isOAuthBrowserOpen();
  const splashRequested = isPostOAuthSplashRequested();
  const splashActive = isPostOAuthSplashActive();
  const overlayMounted = isGoogleSignInOverlayMounted();
  const technicalUrl = windowLocationHasTechnicalOAuthUrl();
  const key = `${oauthLocked}|${browserOpen}|${splashRequested}|${splashActive}|${overlayMounted}|${technicalUrl}`;
  if (key !== lastOAuthUxOverlayLogKey) {
    lastOAuthUxOverlayLogKey = key;
    logOAuthLoaderDiag("SplashPostAuth/oauthUxOverlay", "isOAuthUxOverlayActive=true", {
      oauthProcessingLocked: oauthLocked,
      oauthBrowserOpen: browserOpen,
      postOAuthSplashRequested: splashRequested,
      postOAuthSplashActive: splashActive,
      googleSignInOverlayMounted: overlayMounted,
      technicalOAuthUrl: technicalUrl,
    });
  }
}

/** BootSplashGate : ne pas bloquer sur pathname /auth/callback résiduel hors flux OAuth actif. */
export function isOAuthCallbackRouteBlocking(pathname: string, hash: string): boolean {
  if (windowLocationHasTechnicalOAuthUrl()) return true;
  if (isOnMoveRoute(pathname, hash)) return false;
  if (hash.startsWith("#/auth/callback")) return true;
  if (!isOauthProcessingLocked()) return false;
  return pathname === "/auth/callback" || pathname.endsWith("/auth/callback");
}

export function isOAuthUxOverlayActive(ctx?: OAuthUxOverlayContext): boolean {
  const pathname = normalizeOAuthPathname(ctx?.pathname);
  const hash = ctx?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");

  if (windowLocationHasTechnicalOAuthUrl()) {
    if (typeof window !== "undefined") {
      logOAuthMaskProtectedTechnicalUrl(window.location.href, "window_location_guard");
    }
    logOAuthUxOverlayActiveIfNeeded(true);
    return true;
  }

  if (isOAuthVisualMaskRequired({ pathname, hash })) {
    logOAuthUxOverlayActiveIfNeeded(true);
    return true;
  }

  const hasSession = ctx?.hasSession === true;

  if (hasSession && isOnOAuthFinalAppRoute(pathname, hash)) {
    logOAuthUxOverlayActiveIfNeeded(false);
    return false;
  }

  if (rawOAuthUxOverlayActive()) {
    logOAuthUxOverlayActiveIfNeeded(true);
    return true;
  }

  logOAuthUxOverlayActiveIfNeeded(false);
  return false;
}

/**
 * Réactive les gates React quand les verrous OAuth / splash changent.
 * Sur /move ou /profile avec session : masque actif tant qu’URL technique ou verrous résiduels.
 */
export function useOAuthUxOverlayActive(ctx?: OAuthUxOverlayContext): boolean {
  useSyncExternalStore(
    subscribeOAuthUxOverlay,
    getOAuthUxOverlayEpoch,
    getOAuthUxOverlayEpoch,
  );

  useEffect(() => {
    installOAuthTechnicalUrlGuardListeners();
  }, []);

  const pathname = normalizeOAuthPathname(ctx?.pathname);
  const hash = ctx?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const hasSession = ctx?.hasSession === true;
  const rawActive = rawOAuthUxOverlayActive();
  const onFinalRoute = isOnOAuthFinalAppRoute(pathname, hash);

  useEffect(() => {
    if (!hasSession || !isOnMoveRoute(pathname, hash) || !rawActive) return;
    if (isOAuthVisualMaskRequired({ pathname, hash }) || isOauthProcessingLocked()) return;
    console.log("OAUTH_LOADING_SCREEN_BLOCKED_BY_SESSION", {
      pathname,
      hash,
      hasSession,
      oauthProcessingLocked: isOauthProcessingLocked(),
      oauthBrowserOpen: isOAuthBrowserOpen(),
      postOAuthSplashRequested: isPostOAuthSplashRequested(),
      postOAuthSplashActive: isPostOAuthSplashActive(),
      googleSignInOverlayMounted: isGoogleSignInOverlayMounted(),
      technicalOAuthUrl: windowLocationHasTechnicalOAuthUrl(),
    });
    forceReleaseOAuthLoadingOnMove("oauth_ux_overlay_move");
  }, [hasSession, pathname, hash, rawActive]);

  useEffect(() => {
    if (!hasSession || !shouldFinalizePostAuthUi()) return;
    if (isOAuthVisualMaskRequired({ pathname, hash }) || isOauthProcessingLocked()) return;
    if (!onFinalRoute && !isOauthProcessingLocked()) return;
    releasePostAuthUi(
      "auth_success",
      isOnMoveRoute(pathname, hash) ? "/move" : undefined,
    );
  }, [hasSession, pathname, hash, onFinalRoute]);

  return isOAuthUxOverlayActive(ctx);
}
