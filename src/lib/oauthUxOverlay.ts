import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isPostOAuthSplashActive, isPostOAuthSplashRequested } from "./postOAuthSplash";
import { logOAuthLoaderDiag } from "./oauthLoaderDiag";

/** True tant que l’utilisateur ne doit voir que l’écran SPLove OAuth (pas de routes / URLs techniques). */
let lastOAuthUxOverlayLogKey = "";

/** BootSplashGate : ne pas bloquer sur pathname /auth/callback résiduel hors flux OAuth actif. */
export function isOAuthCallbackRouteBlocking(pathname: string, hash: string): boolean {
  if (hash.startsWith("#/auth/callback")) return true;
  if (!isOauthProcessingLocked()) return false;
  return pathname === "/auth/callback" || pathname.endsWith("/auth/callback");
}

export function isOAuthUxOverlayActive(): boolean {
  const oauthLocked = isOauthProcessingLocked();
  const splashRequested = isPostOAuthSplashRequested();
  const splashActive = isPostOAuthSplashActive();
  const active = oauthLocked || splashRequested || splashActive;
  if (active) {
    const key = `${oauthLocked}|${splashRequested}|${splashActive}`;
    if (key !== lastOAuthUxOverlayLogKey) {
      lastOAuthUxOverlayLogKey = key;
      logOAuthLoaderDiag("SplashPostAuth/oauthUxOverlay", "isOAuthUxOverlayActive=true", {
        oauthProcessingLocked: oauthLocked,
        postOAuthSplashRequested: splashRequested,
        postOAuthSplashActive: splashActive,
      });
    }
  } else {
    lastOAuthUxOverlayLogKey = "";
  }
  return active;
}
