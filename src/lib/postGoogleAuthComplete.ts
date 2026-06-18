import { supabase } from "./supabase";
import { ensureProfileRowForAuthUserId } from "./authProfileSync";
import { resolvePostOAuthPath } from "./profileSelect";
import {
  clearAllOAuthSessionLocks,
  clearOauthProcessingLock,
} from "./oauthCallbackLock";
import {
  forceClearPostOAuthSplash,
  POST_OAUTH_ROUTING_SAFETY_MS,
} from "./postOAuthSplash";
import { stashAuthOAuthUserMessage } from "./authOAuthUserMessage";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "./googleOAuthFlow";
import { clearOAuthCallbackUrl } from "./oauthCallbackUrlStash";
import { logOAuthRedirect, markOAuthSessionAt } from "./postLoginPerf";
import { redactUserId } from "./oauthLogSanitize";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";

function releasePostOAuthOverlayAndLocks(): void {
  clearOauthProcessingLock();
  clearAllOAuthSessionLocks();
  forceClearPostOAuthSplash();
}

function applyHashRoute(path: string, reason: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  scrubOAuthTokensFromNativeWindow();
  releasePostOAuthOverlayAndLocks();
  window.location.hash = `#${normalized}`;
  logOAuthRedirect();
  console.log("AUTH_REDIRECT_ONBOARDING", normalized === "/onboarding" ? { reason, native: true } : undefined);
  if (normalized === "/move") {
    console.log("AUTH_REDIRECT_MOVE", { reason, native: true });
  }
}

/** Après session Supabase établie (OAuth navigateur ou Google natif iOS). */
export async function completePostGoogleAuth(sessionUserId: string, reason: string): Promise<boolean> {
  const isNativeGoogleIos = reason === "google_native_ios";

  console.log("GOOGLE_SIGNIN_SUCCESS");
  if (import.meta.env.DEV) {
    console.log("SESSION_RESTORED");
    console.log("AUTH_SESSION_READY", { userId: redactUserId(sessionUserId) });
  }
  markOAuthSessionAt();
  clearOAuthCallbackUrl();

  if (isNativeGoogleIos) {
    await ensureProfileRowForAuthUserId(sessionUserId);
    const routePath = await resolvePostOAuthPath(supabase, sessionUserId);
    const hashTarget = routePath === "/move" ? "/move" : "/";
    console.log("[BOOT] route decision", { status: "ready", route: hashTarget, oauthRoute: routePath, reason });
    applyHashRoute(hashTarget, reason);
    return true;
  }

  let routePath: "/move" | "/onboarding" | "/" = "/";
  let routed = false;

  const applyPostOAuthRoute = (path: string) => {
    const normalized = path === "/move" ? "/move" : path === "/onboarding" ? "/onboarding" : "/";
    routePath = normalized;
    applyHashRoute(routePath, reason);
    routed = true;
  };

  const safetyTimer = window.setTimeout(() => {
    if (routed) return;
    console.warn("[PostOAuth] routing safety timeout", POST_OAUTH_ROUTING_SAFETY_MS, "ms →", routePath);
    applyPostOAuthRoute(routePath);
  }, POST_OAUTH_ROUTING_SAFETY_MS);

  try {
    await ensureProfileRowForAuthUserId(sessionUserId);
    routePath = await resolvePostOAuthPath(supabase, sessionUserId);
    console.log("[BOOT] route decision", { status: "ready", route: routePath, reason });

    applyPostOAuthRoute(routePath);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    releasePostOAuthOverlayAndLocks();
  } finally {
    window.clearTimeout(safetyTimer);
  }

  return true;
}

export function abortGoogleSignInFlow(): void {
  clearOAuthCallbackUrl();
  scrubOAuthTokensFromNativeWindow("#/auth");
  stashAuthOAuthUserMessage(GOOGLE_OAUTH_USER_ERROR_MSG);
  window.location.hash = "#/auth";
  releasePostOAuthOverlayAndLocks();
}
