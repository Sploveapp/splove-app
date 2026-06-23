import {
  clearAllOAuthSessionLocks,
  clearOauthProcessingLock,
  isOauthProcessingLocked,
} from "./oauthCallbackLock";
import {
  forceClearPostOAuthSplash,
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { hideGoogleSignInOverlay, isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import { isNativeCapacitorApp } from "./authRedirect";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";

export type PostAuthUiRoute = "/move" | "/onboarding";

function postAuthUiSnapshot(): Record<string, boolean> {
  return {
    oauthProcessingLocked: isOauthProcessingLocked(),
    postOAuthSplashRequested: isPostOAuthSplashRequested(),
    postOAuthSplashActive: isPostOAuthSplashActive(),
    googleSignInOverlayMounted: isGoogleSignInOverlayMounted(),
  };
}

function detectRouteFromHash(): PostAuthUiRoute | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (hash.startsWith("#/move")) return "/move";
  if (hash.startsWith("#/onboarding")) return "/onboarding";
  return null;
}

function ensurePostAuthHashRoute(route: PostAuthUiRoute): void {
  if (typeof window === "undefined") return;
  const hashTarget = `#${route}`;
  scrubOAuthTokensFromNativeWindow();

  if (isNativeCapacitorApp()) {
    const origin = window.location.origin || "https://localhost";
    try {
      window.history.replaceState(null, "", `${origin}/${hashTarget}`);
    } catch {
      /* WKWebView */
    }
  }

  if (window.location.hash !== hashTarget) {
    window.location.hash = hashTarget;
  }
}

function flushOAuthUxOverlaySubscribers(): void {
  notifyOAuthUxOverlayChanged();
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    notifyOAuthUxOverlayChanged();
  });
}

/** Libère overlay Google, splash post-auth et verrous — idempotent. */
export function releasePostAuthUi(trigger: string, route?: PostAuthUiRoute): void {
  const before = postAuthUiSnapshot();
  console.log("POST_AUTH_UI_RELEASE_START", { trigger, route, before });

  clearOauthProcessingLock();
  clearAllOAuthSessionLocks();
  forceClearPostOAuthSplash();
  hideGoogleSignInOverlay(trigger);

  if (route) {
    ensurePostAuthHashRoute(route);
  }

  flushOAuthUxOverlaySubscribers();

  const after = postAuthUiSnapshot();
  console.log("POST_AUTH_UI_RELEASE_DONE", { trigger, route, after });

  const confirmedRoute = route ?? detectRouteFromHash();
  if (
    confirmedRoute === "/move" ||
    trigger === "auth_redirect_move" ||
    trigger === "auth_success"
  ) {
    console.log("ROUTE_AFTER_AUTH_CONFIRMED", {
      route: confirmedRoute ?? "/move",
      trigger,
    });
  }
}

/** @deprecated Préférer {@link releasePostAuthUi}. */
export function forceReleaseOAuthUx(reason = "force_release", route?: PostAuthUiRoute): void {
  releasePostAuthUi(reason, route);
}

export function isOAuthUxBlockingRoutes(): boolean {
  return isOauthProcessingLocked();
}
