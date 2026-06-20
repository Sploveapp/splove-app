import { supabase } from "./supabase";
import { ensureProfileRowForAuthUserId } from "./authProfileSync";
import { resolvePostOAuthPath } from "./profileSelect";
import { isNativeCapacitorApp } from "./authRedirect";
import {
  POST_OAUTH_ROUTING_SAFETY_MS,
} from "./postOAuthSplash";
import { stashAuthOAuthUserMessage } from "./authOAuthUserMessage";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "./googleOAuthFlow";
import { clearOAuthCallbackUrl } from "./oauthCallbackUrlStash";
import { logOAuthRedirect, markOAuthSessionAt } from "./postLoginPerf";
import { redactUserId } from "./oauthLogSanitize";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import { forceReleaseOAuthUx } from "./oauthUxRelease";

function navigateAfterOAuth(path: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const hashTarget = `#${normalized}`;
  scrubOAuthTokensFromNativeWindow();

  if (isNativeCapacitorApp()) {
    const origin = window.location.origin || "https://localhost";
    try {
      window.history.replaceState(null, "", `${origin}/${hashTarget}`);
    } catch {
      /* WKWebView — fallback hash */
    }
  }

  if (window.location.hash !== hashTarget) {
    window.location.hash = hashTarget;
  }
}

function applyHashRoute(path: string, reason: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  console.log("ROUTE_AFTER_AUTH", { path: normalized, reason });
  forceReleaseOAuthUx("route_after_auth");
  navigateAfterOAuth(normalized);
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

  let routePath: "/move" | "/onboarding" | "/" = "/onboarding";
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
    try {
      await ensureProfileRowForAuthUserId(sessionUserId);
      routePath = await resolvePostOAuthPath(supabase, sessionUserId);
    } catch (e) {
      console.warn("[PostOAuth] profile/route resolution failed — fallback onboarding", e);
      routePath = "/onboarding";
    }

    console.log("[BOOT] route decision", { status: "ready", route: routePath, reason });
    applyPostOAuthRoute(routePath);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  } finally {
    window.clearTimeout(safetyTimer);
    if (!routed) {
      applyPostOAuthRoute(routePath);
    }
    forceReleaseOAuthUx("post_oauth_finally");
  }

  return true;
}

export function abortGoogleSignInFlow(): void {
  clearOAuthCallbackUrl();
  scrubOAuthTokensFromNativeWindow("#/auth");
  stashAuthOAuthUserMessage(GOOGLE_OAUTH_USER_ERROR_MSG);
  forceReleaseOAuthUx("flow_aborted");
  window.location.hash = "#/auth";
}
