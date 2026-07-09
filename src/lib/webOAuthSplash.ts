import { isNativeCapacitorApp } from "./authRedirect";
import {
  clearOauthProcessingLock,
  isOauthProcessingLocked,
} from "./oauthCallbackLock";
import { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";

const WEB_OAUTH_ACTIVE_KEY = "splove_web_oauth_active";
const GOOGLE_OAUTH_OVERLAY_ID = "splove-google-oauth-overlay";

let webOAuthSplashRequested = false;
let webOAuthSplashActive = false;
let splashStuckWatchdogTimer: number | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export type WebOAuthDebugPhase =
  | "start"
  | "redirect"
  | "callback"
  | "session_ready"
  | "splash_hide_reason"
  | "restore"
  | "force_dismiss_profile_ready"
  | "post_auth_gate_blocked_on_move"
  | "splash_stuck_after_profile_ready";

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function logWebOAuthDebug(
  phase: WebOAuthDebugPhase,
  extra?: Record<string, unknown>,
): void {
  if (extra && Object.keys(extra).length > 0) {
    console.log("[WEB_OAUTH_DEBUG]", phase, extra);
  } else {
    console.log("[WEB_OAUTH_DEBUG]", phase);
  }
}

function persistWebOAuthActive(active: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (active) {
      sessionStorage.setItem(WEB_OAUTH_ACTIVE_KEY, "1");
    } else {
      sessionStorage.removeItem(WEB_OAUTH_ACTIVE_KEY);
    }
  } catch {
    /* private mode */
  }
}

function forceUnmountWebOAuthOverlayDom(): void {
  if (typeof document === "undefined") return;
  document.getElementById(GOOGLE_OAUTH_OVERLAY_ID)?.remove();
}

function collectWebOAuthSplashBlockers(): string[] {
  const blockers: string[] = [];
  if (webOAuthSplashRequested) blockers.push("webOAuthSplashRequested");
  if (webOAuthSplashActive) blockers.push("webOAuthSplashActive");
  if (isOauthProcessingLocked()) blockers.push("oauthProcessingLocked");
  if (typeof document !== "undefined" && document.getElementById(GOOGLE_OAUTH_OVERLAY_ID)) {
    blockers.push("googleSignInOverlayMounted");
  }
  return blockers;
}

function scheduleWebOAuthSplashStuckWatchdog(): void {
  if (typeof window === "undefined" || isNativeCapacitorApp()) return;
  if (typeof window.setTimeout !== "function") return;
  if (splashStuckWatchdogTimer) {
    clearTimeout(splashStuckWatchdogTimer);
  }
  splashStuckWatchdogTimer = window.setTimeout(() => {
    splashStuckWatchdogTimer = null;
    const blockers = collectWebOAuthSplashBlockers();
    if (blockers.length === 0) return;
    logWebOAuthDebug("splash_stuck_after_profile_ready", {
      afterMs: 3000,
      blockers,
    });
  }, 3000);
}

export function isWebOAuthFinalLandingRoute(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const pathname = window.location.pathname || "/";
  if (hash.startsWith("#/move") || hash.startsWith("#/onboarding")) return true;
  return pathname === "/move" || pathname === "/onboarding";
}

export function shouldRestoreWebOAuthSplashFromStorage(): boolean {
  if (isNativeCapacitorApp() || typeof sessionStorage === "undefined") return false;
  if (isWebOAuthFinalLandingRoute()) return false;
  try {
    return sessionStorage.getItem(WEB_OAUTH_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Clic « Continuer avec Google » sur web — survit au redirect navigateur. */
export function beginWebOAuthSplash(): void {
  if (isNativeCapacitorApp()) return;
  if (webOAuthSplashRequested) return;
  webOAuthSplashRequested = true;
  webOAuthSplashActive = true;
  persistWebOAuthActive(true);
  notifyListeners();
  notifyOAuthUxOverlayChanged();
  logWebOAuthDebug("start");
}

/** Restaure le splash après reload sur /auth/callback (cold start OAuth). */
export function restoreWebOAuthSplashFromStorage(): void {
  if (!shouldRestoreWebOAuthSplashFromStorage()) return;
  webOAuthSplashRequested = true;
  webOAuthSplashActive = true;
  notifyListeners();
  notifyOAuthUxOverlayChanged();
  logWebOAuthDebug("restore", {
    path: typeof window !== "undefined" ? window.location.pathname : "",
  });
}

export function dismissWebOAuthSplash(reason: string): void {
  if (isNativeCapacitorApp()) return;
  if (!webOAuthSplashRequested && !webOAuthSplashActive) return;
  webOAuthSplashRequested = false;
  webOAuthSplashActive = false;
  persistWebOAuthActive(false);
  notifyListeners();
  notifyOAuthUxOverlayChanged();
  logWebOAuthDebug("splash_hide_reason", { reason });
}

/** Libération idempotente — efface flags, sessionStorage et overlay DOM. */
export function forceDismissWebOAuthSplash(reason: string): void {
  if (isNativeCapacitorApp()) return;
  const wasActive = webOAuthSplashRequested || webOAuthSplashActive;
  webOAuthSplashRequested = false;
  webOAuthSplashActive = false;
  persistWebOAuthActive(false);
  forceUnmountWebOAuthOverlayDom();
  notifyListeners();
  notifyOAuthUxOverlayChanged();
  if (wasActive || reason === "profile_ready_exit") {
    logWebOAuthDebug("splash_hide_reason", { reason });
  }
}

/**
 * Après AUTH_PROFILE_READY + route /move confirmée : libère splash web,
 * verrou callback et overlay impératif (même si hideGoogleSignInOverlay a été différé).
 */
export function releaseWebOAuthSplashAfterProfileReady(
  reason: "profile_ready_exit" | "session_ready" | "auth_redirect_move" = "profile_ready_exit",
): void {
  if (isNativeCapacitorApp()) return;

  const hadWebSplash = webOAuthSplashRequested || webOAuthSplashActive;
  const hadLock = isOauthProcessingLocked();
  const hadOverlay =
    typeof document !== "undefined" &&
    Boolean(document.getElementById(GOOGLE_OAUTH_OVERLAY_ID));

  if (hadLock) {
    clearOauthProcessingLock();
  }

  const dismissReason =
    reason === "profile_ready_exit" || reason === "auth_redirect_move"
      ? "profile_ready_exit"
      : reason;
  forceDismissWebOAuthSplash(dismissReason);

  if (reason === "profile_ready_exit" || reason === "auth_redirect_move") {
    logWebOAuthDebug("force_dismiss_profile_ready", {
      hadWebSplash,
      hadLock,
      hadOverlay,
    });
  }

  scheduleWebOAuthSplashStuckWatchdog();
}

export function subscribeWebOAuthSplash(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isWebOAuthSplashRequested(): boolean {
  return !isNativeCapacitorApp() && webOAuthSplashRequested;
}

export function isWebOAuthSplashActive(): boolean {
  return !isNativeCapacitorApp() && webOAuthSplashActive;
}

/** Test helper */
export function resetWebOAuthSplashForTests(): void {
  webOAuthSplashRequested = false;
  webOAuthSplashActive = false;
  listeners.clear();
  persistWebOAuthActive(false);
  if (splashStuckWatchdogTimer) {
    clearTimeout(splashStuckWatchdogTimer);
    splashStuckWatchdogTimer = null;
  }
}
