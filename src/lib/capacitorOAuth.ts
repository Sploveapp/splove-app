import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import {
  isForbiddenOAuthRedirectTarget,
  isGoogleOAuthNativePlatform,
  isNativeOAuthCallbackUrl,
  NATIVE_OAUTH_CALLBACK,
  oauthRedirectUrl,
} from "./authRedirect";
import {
  clearOauthProcessingLock,
  isOauthProcessingLocked,
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import { GOOGLE_OAUTH_USER_ERROR_MSG, OAUTH_CALLBACK_INTERRUPTED_MSG } from "./googleOAuthFlow";
import { completeNativeOAuthReturn } from "./completeNativeOAuthReturn";
import { stashAuthOAuthUserMessage } from "./authOAuthUserMessage";
import {
  awaitGoogleSignInOverlayPaint,
  hideGoogleSignInOverlay,
  logGoogleSignInBrowserOpen,
  showGoogleSignInOverlay,
} from "./googleSignInOverlay";
import { forceReleaseOAuthUx } from "./oauthUxRelease";
import { logPkceStorageKeys } from "./oauthPkceDiagnostics";
import { isGoogleAccountsOAuthUrl } from "./oauthGoogleBrowserUrl";
import { googleOAuthNativeBrowserTargetUrl } from "./googleOAuthNativeBrowserUrl";
import {
  ensureIosBrowserNeverOpensSupabase,
  resolveIosGoogleOAuthBrowserTarget,
} from "./iosGoogleOAuthBrowserTarget";
import { parseOAuthCallbackParams } from "./oauthCallbackParams";
import { hideIosGoogleOAuthConnectingOverlay } from "./iosGoogleOAuthDisplay";

export const OAUTH_BROWSER_TIMEOUT_USER_MSG = OAUTH_CALLBACK_INTERRUPTED_MSG;
export const GOOGLE_OAUTH_INTERRUPTED_MSG = GOOGLE_OAUTH_USER_ERROR_MSG;
export const SPLOVE_OAUTH_BROWSER_CLOSED_EVENT = "splove-oauth-browser-closed";

const OAUTH_CALLBACK_STORAGE_KEY = "splove_oauth_callback_url";

let oauthBrowserOpen = false;
let oauthBrowserClosedOnCallback = false;
let lastProcessedOAuthCode: string | null = null;

export function stashOAuthCallbackUrl(url: string): void {
  try {
    sessionStorage.setItem(OAUTH_CALLBACK_STORAGE_KEY, url);
  } catch {
    /* private mode */
  }
}

export function peekOAuthCallbackUrl(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_CALLBACK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearOAuthCallbackUrl(): void {
  try {
    sessionStorage.removeItem(OAUTH_CALLBACK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeOAuthCallbackUrl(): string | null {
  const url = peekOAuthCallbackUrl();
  if (url) clearOAuthCallbackUrl();
  return url;
}

/** Conservé pour Auth / Welcome — pas de timeout navigateur automatique. */
export function subscribeGoogleOAuthBrowserTimeout(
  _onTimeout: (message: string) => void,
): () => void {
  return () => undefined;
}

/** Test helper */
export function resetOAuthBrowserWaitStateForTests(): void {
  oauthBrowserOpen = false;
  oauthBrowserClosedOnCallback = false;
  lastProcessedOAuthCode = null;
  clearOauthProcessingLock();
}

export function isGoogleOAuthInFlight(): boolean {
  return oauthBrowserOpen || isOauthProcessingLocked();
}

export function releaseGoogleOAuthFlowLock(): void {
  /* no-op */
}

async function closeOAuthBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/no active window to close/i.test(msg)) {
      console.warn("BROWSER_CLOSE_FAIL", msg);
    }
  } finally {
    oauthBrowserOpen = false;
  }
}

async function closeOAuthBrowserOnceOnCallback(): Promise<void> {
  if (oauthBrowserClosedOnCallback) return;
  oauthBrowserClosedOnCallback = true;
  await closeOAuthBrowser();
  console.log("BROWSER_CLOSED_ON_CALLBACK");
}

function isNativeOAuthCallbackWithCode(url: string): boolean {
  const trimmed = url.trim();
  return isNativeOAuthCallbackUrl(trimmed) && trimmed.includes("code=");
}

function oauthCodeFromUrl(url: string): string | null {
  return parseOAuthCallbackParams(url).code;
}

function failOAuthCallback(reason: string): void {
  console.log("OAUTH_CALLBACK_FAILED", { reason });
  stashAuthOAuthUserMessage(OAUTH_BROWSER_TIMEOUT_USER_MSG);
  hideIosGoogleOAuthConnectingOverlay(reason);
  hideGoogleSignInOverlay(reason);
  forceReleaseOAuthUx(reason);
  window.location.hash = "#/auth";
}

async function handleNativeOAuthCallback(deepLinkUrl: string): Promise<void> {
  const trimmed = deepLinkUrl.trim();
  const code = oauthCodeFromUrl(trimmed);
  if (!code) {
    console.log("OAUTH_RETURN_SKIP", "missing_code");
    return;
  }

  if (isOauthProcessingLocked()) {
    console.log("OAUTH_RETURN_SKIP", "oauth_callback_in_progress");
    return;
  }

  if (lastProcessedOAuthCode === code) {
    console.log("OAUTH_RETURN_SKIP", "duplicate_code");
    return;
  }

  console.log("APP_URL_OPEN_RECEIVED");
  lastProcessedOAuthCode = code;
  setOauthProcessingLock();
  hideIosGoogleOAuthConnectingOverlay("app_url_open");

  await closeOAuthBrowserOnceOnCallback();

  console.log("OAUTH_DEEP_LINK_RECEIVED", {
    hasCode: true,
    urlLength: trimmed.length,
  });
  stashOAuthCallbackUrl(trimmed);

  try {
    const ok = await completeNativeOAuthReturn(trimmed);
    if (!ok) {
      failOAuthCallback("callback_process_failed");
    }
  } catch (e) {
    console.warn("OAUTH_CALLBACK_ERROR", e instanceof Error ? e.message : e);
    failOAuthCallback("callback_process_exception");
  } finally {
    clearOauthProcessingLock();
  }
}

export async function closeCapacitorOAuthBrowser(): Promise<void> {
  await closeOAuthBrowser();
}

let capacitorAuthBridgeReady = false;

export function initCapacitorAuthBridge(): void {
  if (capacitorAuthBridgeReady || !isGoogleOAuthNativePlatform()) return;
  capacitorAuthBridgeReady = true;
  console.log("CAPACITOR_AUTH_BRIDGE_INIT", { platform: Capacitor.getPlatform() });

  void App.addListener("appUrlOpen", (event) => {
    const opened = event.url?.trim() ?? "";
    if (!isNativeOAuthCallbackWithCode(opened)) return;
    void handleNativeOAuthCallback(opened);
  });

  void Browser.addListener("browserFinished", () => {
    oauthBrowserOpen = false;
  });
}

export async function signInWithGoogleOAuth(): Promise<{ error: Error | null }> {
  if (isGoogleOAuthNativePlatform()) {
    if (isOauthProcessingLocked()) {
      console.log("GOOGLE_SIGNIN_SKIP", "oauth_callback_in_progress");
      return { error: new Error(OAUTH_BROWSER_TIMEOUT_USER_MSG) };
    }

    console.log("GOOGLE_SIGNIN_START");
    oauthBrowserClosedOnCallback = false;
    lastProcessedOAuthCode = null;

    const isIos = Capacitor.getPlatform() === "ios";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_OAUTH_CALLBACK,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      hideGoogleSignInOverlay("oauth_url_error");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    const url = typeof data?.url === "string" ? data.url.trim() : "";
    if (!url) {
      hideGoogleSignInOverlay("missing_oauth_url");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    if (isForbiddenOAuthRedirectTarget(url)) {
      hideGoogleSignInOverlay("forbidden_redirect");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    let browserTargetUrl: string;
    if (isIos) {
      const iosTarget = ensureIosBrowserNeverOpensSupabase(
        await resolveIosGoogleOAuthBrowserTarget(url),
        url,
      );
      browserTargetUrl = iosTarget.url;
    } else {
      browserTargetUrl = googleOAuthNativeBrowserTargetUrl(url, "android");
    }

    await logPkceStorageKeys("PKCE_KEYS_AFTER_SIGNIN");

    if (!isIos) {
      showGoogleSignInOverlay();
      await awaitGoogleSignInOverlayPaint();
      logGoogleSignInBrowserOpen();
    }

    if (isGoogleAccountsOAuthUrl(browserTargetUrl)) {
      console.log("BROWSER_OPEN_GOOGLE", {
        host: "accounts.google.com",
      });
    }

    try {
      oauthBrowserOpen = true;
      await Browser.open({ url: browserTargetUrl, presentationStyle: "fullscreen" });
    } catch (e) {
      oauthBrowserOpen = false;
      hideGoogleSignInOverlay("browser_open_error");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    return { error: null };
  }

  console.log("GOOGLE_SIGNIN_START");
  const redirectTo = oauthRedirectUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  return { error: error ?? null };
}
