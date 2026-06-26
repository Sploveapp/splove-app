import { supabase } from "./supabase";
import { ensureProfileRowForAuthUserId } from "./authProfileSync";
import { resolvePostOAuthPath } from "./profileSelect";
import { isNativeCapacitorApp } from "./authRedirect";
import {
  POST_OAUTH_ROUTING_SAFETY_MS,
} from "./postOAuthSplash";
import { stashAuthOAuthUserMessage } from "./authOAuthUserMessage";
import { OAUTH_CALLBACK_INTERRUPTED_MSG } from "./googleOAuthFlow";
import { clearOAuthCallbackUrl } from "./oauthCallbackUrlStash";
import { logOAuthRedirect, markOAuthSessionAt } from "./postLoginPerf";
import { redactUserId } from "./oauthLogSanitize";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import { forceReleaseOAuthUx } from "./oauthUxRelease";
import { hideIosGoogleOAuthConnectingOverlay } from "./iosGoogleOAuthDisplay";
import {
  logOAuthRedirectDestination,
  logOAuthSuccess,
  shouldDeferOAuthRedirectUntilSessionLoaded,
  verifyDefinitiveSupabaseSession,
} from "./oauthSessionRecoveryDiag";

async function navigateAfterOAuthVerified(path: string, context: string, reason: string): Promise<boolean> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const sessionVerify = await verifyDefinitiveSupabaseSession(context);
  if (shouldDeferOAuthRedirectUntilSessionLoaded(normalized, sessionVerify)) {
    logOAuthRedirectDestination(context, normalized, {
      blocked: true,
      reason: sessionVerify.reason,
      oauthReason: reason,
    });
    return false;
  }
  logOAuthRedirectDestination(context, normalized, {
    blocked: false,
    sessionVerified: true,
    oauthReason: reason,
  });
  navigateAfterOAuth(normalized);
  return true;
}

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

async function applyHashRoute(path: string, reason: string): Promise<boolean> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  console.log("ROUTE_AFTER_AUTH", { path: normalized, reason });

  const navigated = await navigateAfterOAuthVerified(normalized, "post_google_auth", reason);
  if (!navigated) {
    console.warn("[PostOAuth] redirect deferred — session not verified", { path: normalized, reason });
    return false;
  }

  forceReleaseOAuthUx("route_after_auth");
  logOAuthRedirect();
  console.log("AUTH_REDIRECT_ONBOARDING", normalized === "/onboarding" ? { reason, native: true } : undefined);
  if (normalized === "/move") {
    console.log("AUTH_REDIRECT_MOVE", { reason, native: true });
  }
  return true;
}

/** Après session Supabase établie (OAuth navigateur ou Google natif iOS). */
export async function completePostGoogleAuth(sessionUserId: string, reason: string): Promise<boolean> {
  const isNativeGoogleIos = reason === "google_native_ios";

  console.log("GOOGLE_SIGNIN_SUCCESS");
  hideIosGoogleOAuthConnectingOverlay("google_signin_success");
  logOAuthSuccess("post_google_auth", { reason });
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
    return await applyHashRoute(hashTarget, reason);
  }

  let routePath: "/move" | "/onboarding" | "/" = "/onboarding";
  let routed = false;

  const applyPostOAuthRoute = async (path: string) => {
    const normalized = path === "/move" ? "/move" : path === "/onboarding" ? "/onboarding" : "/";
    routePath = normalized;
    const ok = await applyHashRoute(routePath, reason);
    if (ok) routed = true;
  };

  const safetyTimer = window.setTimeout(() => {
    if (routed) return;
    console.warn("[PostOAuth] routing safety timeout", POST_OAUTH_ROUTING_SAFETY_MS, "ms →", routePath);
    void applyPostOAuthRoute(routePath);
  }, POST_OAUTH_ROUTING_SAFETY_MS);

  try {
    try {
      await ensureProfileRowForAuthUserId(sessionUserId);
      console.log("PROFILE_FETCH_SUCCESS", { userId: sessionUserId });
      routePath = await resolvePostOAuthPath(supabase, sessionUserId);
    } catch (e) {
      console.warn("[PostOAuth] profile/route resolution failed — fallback onboarding", e);
      routePath = "/onboarding";
    }

    console.log("[BOOT] route decision", { status: "ready", route: routePath, reason });
    await applyPostOAuthRoute(routePath);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  } finally {
    window.clearTimeout(safetyTimer);
    if (!routed) {
      await applyPostOAuthRoute(routePath);
    }
    if (routed) {
      forceReleaseOAuthUx("post_oauth_finally");
    }
  }

  return routed;
}

export function abortGoogleSignInFlow(): void {
  clearOAuthCallbackUrl();
  scrubOAuthTokensFromNativeWindow("#/auth");
  stashAuthOAuthUserMessage(OAUTH_CALLBACK_INTERRUPTED_MSG);
  forceReleaseOAuthUx("flow_aborted");
  window.location.hash = "#/auth";
}
