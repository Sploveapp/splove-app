import { clearAllOAuthSessionLocks, clearOauthProcessingLock, isOauthProcessingLocked } from "./oauthCallbackLock";
import { forceClearPostOAuthSplash } from "./postOAuthSplash";
import { hideGoogleSignInOverlay } from "./googleSignInOverlay";

/** Libère overlay OAuth, splash post-auth et verrous — idempotent. */
export function forceReleaseOAuthUx(reason = "force_release"): void {
  clearOauthProcessingLock();
  clearAllOAuthSessionLocks();
  forceClearPostOAuthSplash();
  hideGoogleSignInOverlay(reason);
}

export function isOAuthUxBlockingRoutes(): boolean {
  return isOauthProcessingLocked();
}
