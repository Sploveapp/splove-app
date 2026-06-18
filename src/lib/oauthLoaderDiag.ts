import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isAuthCallbackPath } from "./authRedirect";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";

/** Snapshot des verrous / overlays OAuth — diagnostic loader « Connexion sécurisée… ». */
export function oauthLoaderOverlaySnapshot(): Record<string, boolean> {
  return {
    oauthProcessingLocked: isOauthProcessingLocked(),
    postOAuthSplashRequested: isPostOAuthSplashRequested(),
    postOAuthSplashActive: isPostOAuthSplashActive(),
    authCallbackPath: isAuthCallbackPath(),
  };
}

export function logOAuthLoaderDiag(
  component: string,
  action: string,
  detail: Record<string, unknown> = {},
): void {
  console.log(`[OAuthLoaderDiag] ${component} → ${action}`, {
    ...detail,
    overlay: oauthLoaderOverlaySnapshot(),
  });
}
