import { isAuthCallbackPath } from "./authRedirect";
import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isPostOAuthSplashActive, isPostOAuthSplashRequested } from "./postOAuthSplash";
import { logOAuthLoaderDiag } from "./oauthLoaderDiag";

/** True tant que l’utilisateur ne doit voir que l’écran SPLove OAuth (pas de routes / URLs techniques). */
let lastOAuthUxOverlayLogKey = "";

export function isOAuthUxOverlayActive(): boolean {
  const oauthLocked = isOauthProcessingLocked();
  const splashRequested = isPostOAuthSplashRequested();
  const splashActive = isPostOAuthSplashActive();
  const authCallback = isAuthCallbackPath();
  const active = oauthLocked || splashRequested || splashActive || authCallback;
  if (active) {
    const key = `${oauthLocked}|${splashRequested}|${splashActive}|${authCallback}`;
    if (key !== lastOAuthUxOverlayLogKey) {
      lastOAuthUxOverlayLogKey = key;
      logOAuthLoaderDiag("SplashPostAuth/oauthUxOverlay", "isOAuthUxOverlayActive=true", {
        oauthProcessingLocked: oauthLocked,
        postOAuthSplashRequested: splashRequested,
        postOAuthSplashActive: splashActive,
        authCallbackPath: authCallback,
      });
    }
  } else {
    lastOAuthUxOverlayLogKey = "";
  }
  return active;
}
