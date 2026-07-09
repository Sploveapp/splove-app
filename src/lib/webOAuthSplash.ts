import { isNativeCapacitorApp } from "./authRedirect";
import { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";

const WEB_OAUTH_ACTIVE_KEY = "splove_web_oauth_active";

let webOAuthSplashRequested = false;
let webOAuthSplashActive = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function logWebOAuthDebug(
  phase: "start" | "redirect" | "callback" | "session_ready" | "splash_hide_reason" | "restore",
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
  if (isNativeCapacitorApp() || typeof sessionStorage === "undefined") return;
  try {
    if (sessionStorage.getItem(WEB_OAUTH_ACTIVE_KEY) !== "1") return;
    webOAuthSplashRequested = true;
    webOAuthSplashActive = true;
    notifyListeners();
    notifyOAuthUxOverlayChanged();
    logWebOAuthDebug("restore", {
      path: typeof window !== "undefined" ? window.location.pathname : "",
    });
  } catch {
    /* ignore */
  }
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
}
