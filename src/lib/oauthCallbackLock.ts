import { isAuthCallbackPath } from "./authRedirect";

export const OAUTH_PROCESSING_STORAGE_KEY = "splove_oauth_processing";

let oauthCallbackInProgress = false;

function syncWindowOauthFlag(locked: boolean): void {
  if (typeof window === "undefined") return;
  if (locked) {
    window.__SPLOVE_OAUTH_PROCESSING__ = true;
  } else {
    delete window.__SPLOVE_OAUTH_PROCESSING__;
  }
}

export function setOauthProcessingLock(): void {
  oauthCallbackInProgress = true;
  syncWindowOauthFlag(true);
  try {
    sessionStorage.setItem(OAUTH_PROCESSING_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function clearOauthProcessingLock(): void {
  oauthCallbackInProgress = false;
  syncWindowOauthFlag(false);
  try {
    sessionStorage.removeItem(OAUTH_PROCESSING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Nettoie tous les verrous / marqueurs OAuth (logout ou timeout Google iOS). */
export function clearAllOAuthSessionLocks(): void {
  clearOauthProcessingLock();
  const keys = [
    OAUTH_PROCESSING_STORAGE_KEY,
    "splove_oauth_processing",
    "splove_oauth_callback_url",
    "oauth_callback_in_progress",
    "oauth_processing_lock",
    "post_login_pending",
    "splove_oauth_post_success",
    "splove_ios_auth_debug_hold",
  ];
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function isOauthProcessingLocked(): boolean {
  if (typeof window !== "undefined" && window.__SPLOVE_OAUTH_PROCESSING__ === true) {
    return true;
  }
  if (oauthCallbackInProgress) return true;
  try {
    return sessionStorage.getItem(OAUTH_PROCESSING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Pose le verrou avant le premier paint si l’URL est un retour OAuth (survit au reload WebView). */
export function ensureOauthCallbackBootstrapLock(): void {
  if (typeof window === "undefined") return;
  if (isOauthProcessingLocked()) return;

  const urlBits = `${window.location.search}${window.location.hash}`;
  const hasOAuthTokens = /access_token|refresh_token|(?:^|[?&#])code=/i.test(urlBits);
  if (isAuthCallbackPath() || hasOAuthTokens) {
    setOauthProcessingLock();
  }
}

/** @deprecated Prefer {@link setOauthProcessingLock} / {@link clearOauthProcessingLock}. */
export function setOAuthCallbackInProgress(value: boolean): void {
  if (value) setOauthProcessingLock();
  else clearOauthProcessingLock();
}

/**
 * True while OAuth callback is establishing a session (ignore INITIAL_SESSION null races).
 */
export function isOAuthCallbackInProgress(): boolean {
  if (isOauthProcessingLocked()) return true;
  return typeof window !== "undefined" && isAuthCallbackPath();
}
