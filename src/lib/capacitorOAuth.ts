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
import { GOOGLE_OAUTH_USER_ERROR_MSG, APPLE_OAUTH_USER_ERROR_MSG, OAUTH_CALLBACK_INTERRUPTED_MSG } from "./googleOAuthFlow";
import { completeNativeOAuthReturn } from "./completeNativeOAuthReturn";
import { stashAuthOAuthUserMessage } from "./authOAuthUserMessage";
import {
  awaitGoogleSignInOverlayPaint,
  hideGoogleSignInOverlay,
  isGoogleSignInOverlayMounted,
  logGoogleSignInBrowserOpen,
  showGoogleSignInOverlay,
} from "./googleSignInOverlay";
import {
  beginWebOAuthSplash,
  dismissWebOAuthSplash,
  logWebOAuthDebug,
} from "./webOAuthSplash";
import { forceReleaseOAuthUx } from "./oauthUxRelease";
import { logPkceStorageKeys } from "./oauthPkceDiagnostics";
import { isGoogleAccountsOAuthUrl } from "./oauthGoogleBrowserUrl";
import { googleOAuthNativeBrowserTargetUrl } from "./googleOAuthNativeBrowserUrl";
import {
  ensureIosBrowserNeverOpensSupabase,
  isIosBrowserOpenAllowed,
  logIosOAuthBrowserTarget,
  isSupabaseAuthHost,
  resolveIosGoogleOAuthBrowserTarget,
} from "./iosGoogleOAuthBrowserTarget";
import { parseOAuthCallbackParams } from "./oauthCallbackParams";
import { hideIosGoogleOAuthConnectingOverlay } from "./iosGoogleOAuthDisplay";
import { markOAuthBrowserOpen, resetOAuthBrowserOpenStateForTests } from "./oauthBrowserOpenState";
import {
  isSploveIosGoogleOAuthAvailable,
  openSploveIosGoogleOAuthSession,
} from "./sploveIosGoogleOAuth";

export const OAUTH_BROWSER_TIMEOUT_USER_MSG = OAUTH_CALLBACK_INTERRUPTED_MSG;
export const GOOGLE_OAUTH_INTERRUPTED_MSG = GOOGLE_OAUTH_USER_ERROR_MSG;
export const SPLOVE_OAUTH_BROWSER_CLOSED_EVENT = "splove-oauth-browser-closed";

const OAUTH_CALLBACK_STORAGE_KEY = "splove_oauth_callback_url";
/** Apple Browser OAuth : évite « Connexion sécurisée » bloqué si le callback ne termine pas. */
const APPLE_OAUTH_BROWSER_SAFETY_MS = 90_000;

let oauthBrowserOpen = false;
let oauthBrowserClosedOnCallback = false;
let lastProcessedOAuthCode: string | null = null;
/** iOS : ASWebAuthenticationSession actif — pas de Browser.open / Browser.close. */
let iosNativeOAuthSessionActive = false;
/** Provider OAuth natif en cours — logs Apple ciblés sur callback partagé. */
let activeNativeOAuthProvider: "google" | "apple" | null = null;
let appleOAuthSafetyTimer: number | null = null;

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
  iosNativeOAuthSessionActive = false;
  activeNativeOAuthProvider = null;
  clearAppleOAuthSafetyTimer();
  clearOauthProcessingLock();
  resetOAuthBrowserOpenStateForTests();
}

function clearAppleOAuthSafetyTimer(): void {
  if (appleOAuthSafetyTimer !== null) {
    window.clearTimeout(appleOAuthSafetyTimer);
    appleOAuthSafetyTimer = null;
  }
}

function scheduleAppleOAuthSafetyTimeout(): void {
  clearAppleOAuthSafetyTimer();
  appleOAuthSafetyTimer = window.setTimeout(() => {
    if (activeNativeOAuthProvider !== "apple") return;
    if (
      !oauthBrowserOpen &&
      !isOauthProcessingLocked() &&
      !isGoogleSignInOverlayMounted()
    ) {
      return;
    }
    console.log("[AppleOAuth] callback_error", { reason: "safety_timeout" });
    failOAuthCallback("apple_safety_timeout");
  }, APPLE_OAUTH_BROWSER_SAFETY_MS);
}

function forceDismissNativeOAuthConnectingUi(trigger: string): void {
  hideIosGoogleOAuthConnectingOverlay(trigger, { force: true });
  hideGoogleSignInOverlay(trigger, { force: true });
}

function logAppleOAuthCallbackReceived(url: string): void {
  const trimmed = url.trim();
  const params = parseOAuthCallbackParams(trimmed);
  let protocol = "";
  let host = "";
  let pathname = "";
  try {
    const parsed = new URL(trimmed);
    protocol = parsed.protocol.replace(/:$/, "");
    host = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    /* invalid deep link */
  }
  const hasError = /(?:^|[?&#])error=/i.test(trimmed);
  console.log("[AppleOAuth] callback_received", {
    protocol,
    host,
    pathname,
    hasCode: params.hasCode,
    hasAccessToken: params.hasAccessToken,
    hasError,
  });
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
    markOAuthBrowserOpen(false);
  }
}

async function closeOAuthBrowserOnceOnCallback(): Promise<void> {
  if (oauthBrowserClosedOnCallback) return;
  oauthBrowserClosedOnCallback = true;
  await closeOAuthBrowser();
  console.log("BROWSER_CLOSED_ON_CALLBACK");
}

function isNativeOAuthCallbackActionable(url: string): boolean {
  const trimmed = url.trim();
  if (!isNativeOAuthCallbackUrl(trimmed)) return false;
  const params = parseOAuthCallbackParams(trimmed);
  return params.hasCode || params.hasAccessToken;
}

function failOAuthCallback(reason: string): void {
  console.log("OAUTH_CALLBACK_FAILED", { reason });
  if (activeNativeOAuthProvider === "apple") {
    console.log("[AppleOAuth] callback_error", { reason });
    activeNativeOAuthProvider = null;
    clearAppleOAuthSafetyTimer();
  }
  stashAuthOAuthUserMessage(OAUTH_BROWSER_TIMEOUT_USER_MSG);
  forceDismissNativeOAuthConnectingUi(reason);
  forceReleaseOAuthUx(reason);
  window.location.hash = "#/auth";
}

type NativeOAuthCallbackOptions = {
  /** ASWebAuthenticationSession a déjà fermé la session — ne pas appeler Browser.close. */
  skipBrowserClose?: boolean;
  source?: "native_plugin" | "app_url_open";
};

async function handleNativeOAuthCallback(
  deepLinkUrl: string,
  options: NativeOAuthCallbackOptions = {},
): Promise<boolean> {
  const trimmed = deepLinkUrl.trim();
  const callbackParams = parseOAuthCallbackParams(trimmed);
  const isAppleFlow = activeNativeOAuthProvider === "apple";

  if (!callbackParams.hasCode && !callbackParams.hasAccessToken) {
    if (isAppleFlow) {
      console.log("[AppleOAuth] callback_error", { reason: "missing_code_or_token" });
    }
    console.log("OAUTH_RETURN_SKIP", "missing_code_or_token");
    return false;
  }

  if (isOauthProcessingLocked()) {
    console.log("OAUTH_RETURN_SKIP", "oauth_callback_in_progress");
    return false;
  }

  const code = callbackParams.code;
  if (code && lastProcessedOAuthCode === code) {
    console.log("OAUTH_RETURN_SKIP", "duplicate_code");
    return false;
  }

  const fromNativePlugin = options.source === "native_plugin" || iosNativeOAuthSessionActive;
  if (fromNativePlugin) {
    console.log("IOS_NATIVE_OAUTH_CALLBACK_RECEIVED");
  } else {
    console.log("APP_URL_OPEN_RECEIVED");
  }

  if (code) {
    lastProcessedOAuthCode = code;
  }
  setOauthProcessingLock();
  if (isAppleFlow) {
    logAppleOAuthCallbackReceived(trimmed);
  }

  const skipBrowserClose = options.skipBrowserClose || fromNativePlugin;
  if (!skipBrowserClose) {
    await closeOAuthBrowserOnceOnCallback();
  }

  console.log("OAUTH_DEEP_LINK_RECEIVED", {
    hasCode: callbackParams.hasCode,
    hasAccessToken: callbackParams.hasAccessToken,
    urlLength: trimmed.length,
    via: fromNativePlugin ? "native_plugin" : "app_url_open",
  });
  stashOAuthCallbackUrl(trimmed);

  let succeeded = false;
  try {
    if (isAppleFlow && callbackParams.hasCode) {
      console.log("[AppleOAuth] code_exchange_start");
    }
    const ok = await completeNativeOAuthReturn(trimmed);
    if (!ok) {
      failOAuthCallback("callback_process_failed");
      return false;
    }
    if (isAppleFlow) {
      console.log("[AppleOAuth] code_exchange_success");
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.user?.id) {
        failOAuthCallback("session_missing_after_exchange");
        return false;
      }
      console.log("[AppleOAuth] session_ready");
      activeNativeOAuthProvider = null;
      clearAppleOAuthSafetyTimer();
    }
    succeeded = true;
    return true;
  } catch (e) {
    console.warn("OAUTH_CALLBACK_ERROR", e instanceof Error ? e.message : e);
    failOAuthCallback("callback_process_exception");
    return false;
  } finally {
    clearOauthProcessingLock();
    iosNativeOAuthSessionActive = false;
    if (isAppleFlow) {
      oauthBrowserOpen = false;
      markOAuthBrowserOpen(false);
      forceDismissNativeOAuthConnectingUi(
        succeeded ? "apple_oauth_success" : "apple_oauth_settled",
      );
    }
  }
}

/** Traite splove://auth/callback — jamais via Browser.open. */
export async function routeOAuthDeepLink(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!isNativeOAuthCallbackActionable(trimmed)) return false;
  console.log("OAUTH_DEEP_LINK_ROUTE", { via: "routeOAuthDeepLink" });
  await handleNativeOAuthCallback(trimmed);
  return true;
}

function hostFromOAuthUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid)";
  }
}


/** iOS : accounts.google.com uniquement — jamais *.supabase.co ni splove://callback. */
export function isIosOAuthBrowserOpenAllowedUrl(url: string): boolean {
  return isIosBrowserOpenAllowed(url) && !isNativeOAuthCallbackUrl(url.trim());
}

/** Android : Google ou Supabase /authorize — jamais splove://callback. */
export function isOAuthBrowserOpenAllowedUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isNativeOAuthCallbackUrl(trimmed)) return false;
  if (isGoogleAccountsOAuthUrl(trimmed)) return true;
  if (isSupabaseAuthHost(trimmed)) return true;
  return false;
}

function isAppleOAuthBrowserOpenAllowedUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || isNativeOAuthCallbackUrl(trimmed)) return false;
  if (isSupabaseAuthHost(trimmed) && /provider=apple/i.test(trimmed)) return true;
  if (/appleid\.apple\.com/i.test(hostFromOAuthUrl(trimmed))) return true;
  return false;
}

async function openAppleOAuthBrowser(url: string): Promise<{ error: Error | null }> {
  const trimmed = url.trim();

  if (await routeOAuthDeepLink(trimmed)) {
    return { error: null };
  }

  if (!isAppleOAuthBrowserOpenAllowedUrl(trimmed)) {
    console.log("[AppleOAuth] error", { reason: "url_not_allowed", host: hostFromOAuthUrl(trimmed) });
    hideGoogleSignInOverlay("apple_browser_open_blocked");
    hideIosGoogleOAuthConnectingOverlay("apple_browser_open_blocked");
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  try {
    oauthBrowserOpen = true;
    markOAuthBrowserOpen(true);
    await Browser.open({ url: trimmed, presentationStyle: "fullscreen" });
    console.log("[AppleOAuth] browser_opened", { host: hostFromOAuthUrl(trimmed) });
    scheduleAppleOAuthSafetyTimeout();
    return { error: null };
  } catch (e) {
    oauthBrowserOpen = false;
    const message = e instanceof Error ? e.message : String(e);
    console.log("[AppleOAuth] error", { reason: "browser_open_failed", message });
    hideGoogleSignInOverlay("apple_browser_open_error");
    hideIosGoogleOAuthConnectingOverlay("apple_browser_open_error");
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }
}

export async function signInWithAppleOAuth(): Promise<{ error: Error | null }> {
  console.log("[AppleOAuth] start");

  if (isGoogleOAuthNativePlatform()) {
    if (isOauthProcessingLocked()) {
      console.log("[AppleOAuth] error", { reason: "oauth_callback_in_progress" });
      return { error: new Error(OAUTH_BROWSER_TIMEOUT_USER_MSG) };
    }

    oauthBrowserClosedOnCallback = false;
    lastProcessedOAuthCode = null;
    activeNativeOAuthProvider = "apple";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: NATIVE_OAUTH_CALLBACK,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      activeNativeOAuthProvider = null;
      hideGoogleSignInOverlay("apple_oauth_url_error");
      hideIosGoogleOAuthConnectingOverlay("apple_oauth_url_error");
      console.log("[AppleOAuth] error", { reason: "signInWithOAuth_failed" });
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    const url = typeof data?.url === "string" ? data.url.trim() : "";
    if (!url) {
      activeNativeOAuthProvider = null;
      hideGoogleSignInOverlay("apple_missing_oauth_url");
      hideIosGoogleOAuthConnectingOverlay("apple_missing_oauth_url");
      console.log("[AppleOAuth] error", { reason: "missing_oauth_url" });
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    if (isForbiddenOAuthRedirectTarget(url)) {
      activeNativeOAuthProvider = null;
      hideGoogleSignInOverlay("apple_forbidden_redirect");
      hideIosGoogleOAuthConnectingOverlay("apple_forbidden_redirect");
      console.log("[AppleOAuth] error", { reason: "forbidden_redirect" });
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    console.log("[AppleOAuth] oauth_url_ready", { host: hostFromOAuthUrl(url) });
    await logPkceStorageKeys("PKCE_KEYS_AFTER_SIGNIN");
    return openAppleOAuthBrowser(url);
  }

  const redirectTo = oauthRedirectUrl();
  beginWebOAuthSplash();
  showGoogleSignInOverlay();
  await awaitGoogleSignInOverlayPaint();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    dismissWebOAuthSplash("apple_oauth_url_error");
    hideGoogleSignInOverlay("apple_oauth_url_error");
    console.log("[AppleOAuth] error", { reason: "signInWithOAuth_failed" });
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  const url = typeof data?.url === "string" ? data.url.trim() : "";
  if (!url) {
    dismissWebOAuthSplash("apple_missing_oauth_url");
    hideGoogleSignInOverlay("apple_missing_oauth_url");
    console.log("[AppleOAuth] error", { reason: "missing_oauth_url" });
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  console.log("[AppleOAuth] oauth_url_ready", { host: hostFromOAuthUrl(url) });
  logWebOAuthDebug("redirect", { host: hostFromOAuthUrl(url), provider: "apple" });
  window.location.assign(url);
  return { error: null };
}

function failIosGoogleOAuthResolve(reason: string): { error: Error } {
  console.log("IOS_OAUTH_RESOLVE_FAIL", { reason });
  hideGoogleSignInOverlay(reason);
  hideIosGoogleOAuthConnectingOverlay(reason);
  stashAuthOAuthUserMessage(OAUTH_BROWSER_TIMEOUT_USER_MSG);
  return { error: new Error(OAUTH_BROWSER_TIMEOUT_USER_MSG) };
}

/** Dernière barrière iOS — throw si host supabase.co, jamais Browser.open. */
export function assertIosBrowserOpenBeforeOpen(
  url: string,
  strategy: string,
): { url: string; host: string; strategy: string } {
  const trimmed = url.trim();
  const host = hostFromOAuthUrl(trimmed);

  if (/supabase\.co/i.test(host) || isSupabaseAuthHost(trimmed)) {
    console.log("BROWSER_OPEN_BLOCKED", {
      url: trimmed,
      host,
      strategy,
      reason: "supabase_host_forbidden",
    });
    throw new Error("IOS_BROWSER_OPEN_SUPABASE_FORBIDDEN");
  }

  if (!isIosOAuthBrowserOpenAllowedUrl(trimmed)) {
    console.log("BROWSER_OPEN_BLOCKED", {
      url: trimmed,
      host,
      strategy,
      reason: "ios_not_accounts_google",
    });
    throw new Error("IOS_BROWSER_OPEN_NOT_GOOGLE");
  }

  console.log("BROWSER_OPEN_START", { url: trimmed, host, strategy });
  return { url: trimmed, host, strategy };
}

/**
 * iOS : ASWebAuthenticationSession via SploveIosGoogleOAuth (pas de SFSafariViewController).
 * Repli Browser.open uniquement si le plugin natif est indisponible ou échoue.
 */
async function openIosNativeOAuthSession(
  googleUrl: string,
  strategy = "google_direct",
): Promise<{ error: Error | null }> {
  const trimmed = googleUrl.trim();
  console.log("IOS_NATIVE_OAUTH_START");

  if (await routeOAuthDeepLink(trimmed)) {
    return { error: null };
  }

  try {
    assertIosBrowserOpenBeforeOpen(trimmed, strategy);
  } catch {
    return failIosGoogleOAuthResolve("native_oauth_url_blocked");
  }

  const pluginAvailable = await isSploveIosGoogleOAuthAvailable();
  if (pluginAvailable) {
    try {
      console.log("IOS_NATIVE_OAUTH_PLUGIN_OPEN");
      iosNativeOAuthSessionActive = true;
      const result = await openSploveIosGoogleOAuthSession(trimmed);

      if (result.outcome === "canceled") {
        iosNativeOAuthSessionActive = false;
        hideGoogleSignInOverlay("native_oauth_canceled");
        hideIosGoogleOAuthConnectingOverlay("native_oauth_canceled");
        return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
      }

      if (result.outcome === "callback" && result.url?.trim()) {
        const ok = await handleNativeOAuthCallback(result.url.trim(), {
          skipBrowserClose: true,
          source: "native_plugin",
        });
        if (!ok) {
          return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
        }
        console.log("IOS_NATIVE_OAUTH_SUCCESS");
        return { error: null };
      }

      console.log("IOS_NATIVE_OAUTH_FALLBACK_BROWSER_USED", {
        reason: "unexpected_plugin_outcome",
        outcome: result.outcome,
      });
    } catch (e) {
      iosNativeOAuthSessionActive = false;
      console.log("IOS_NATIVE_OAUTH_FALLBACK_BROWSER_USED", {
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    console.log("IOS_NATIVE_OAUTH_FALLBACK_BROWSER_USED", { reason: "plugin_unavailable" });
  }

  return openIosOAuthBrowser(trimmed, strategy);
}

async function openIosOAuthBrowser(
  googleUrl: string,
  strategy = "google_direct",
): Promise<{ error: Error | null }> {
  const trimmed = googleUrl.trim();

  if (await routeOAuthDeepLink(trimmed)) {
    return { error: null };
  }

  try {
    const { url, host } = assertIosBrowserOpenBeforeOpen(trimmed, strategy);
    console.log("BROWSER_OPEN_GOOGLE", { host: "accounts.google.com" });
    oauthBrowserOpen = true;
    markOAuthBrowserOpen(true);
    await Browser.open({ url, presentationStyle: "fullscreen" });
    console.log("BROWSER_OPEN_DONE", { url, host, strategy });
    return { error: null };
  } catch (e) {
    oauthBrowserOpen = false;
    const message = e instanceof Error ? e.message : String(e);
    if (
      message === "IOS_BROWSER_OPEN_SUPABASE_FORBIDDEN" ||
      message === "IOS_BROWSER_OPEN_NOT_GOOGLE"
    ) {
      return failIosGoogleOAuthResolve("browser_open_blocked");
    }
    console.log("BROWSER_OPEN_FAIL", { message, strategy });
    return failIosGoogleOAuthResolve("browser_open_error");
  }
}

async function openAndroidOAuthBrowser(url: string): Promise<{ error: Error | null }> {
  const trimmed = url.trim();

  if (await routeOAuthDeepLink(trimmed)) {
    return { error: null };
  }

  if (!isOAuthBrowserOpenAllowedUrl(trimmed)) {
    console.log("BROWSER_OPEN_BLOCKED", {
      host: hostFromOAuthUrl(trimmed),
      reason: "url_not_allowed_android",
    });
    hideGoogleSignInOverlay("browser_open_blocked");
    return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
  }

  if (isGoogleAccountsOAuthUrl(trimmed)) {
    console.log("BROWSER_OPEN_GOOGLE", { host: "accounts.google.com" });
  }

  console.log("BROWSER_OPEN_START", { host: hostFromOAuthUrl(trimmed) });
  try {
    oauthBrowserOpen = true;
    markOAuthBrowserOpen(true);
    await Browser.open({ url: trimmed, presentationStyle: "fullscreen" });
    console.log("BROWSER_OPEN_DONE", { host: hostFromOAuthUrl(trimmed) });
    return { error: null };
  } catch (e) {
    oauthBrowserOpen = false;
    const message = e instanceof Error ? e.message : String(e);
    console.log("BROWSER_OPEN_FAIL", { message });
    hideGoogleSignInOverlay("browser_open_error");
    return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
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
    if (!isNativeOAuthCallbackActionable(opened)) return;
    void handleNativeOAuthCallback(opened, { source: "app_url_open" });
  });

  void Browser.addListener("browserFinished", () => {
    oauthBrowserOpen = false;
    markOAuthBrowserOpen(false);
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
      hideIosGoogleOAuthConnectingOverlay("oauth_url_error");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    const url = typeof data?.url === "string" ? data.url.trim() : "";
    if (!url) {
      hideGoogleSignInOverlay("missing_oauth_url");
      hideIosGoogleOAuthConnectingOverlay("missing_oauth_url");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    if (isForbiddenOAuthRedirectTarget(url)) {
      hideGoogleSignInOverlay("forbidden_redirect");
      hideIosGoogleOAuthConnectingOverlay("forbidden_redirect");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    if (isIos) {
      console.log("IOS_OAUTH_RESOLVE_START");
      const iosTarget = ensureIosBrowserNeverOpensSupabase(
        await resolveIosGoogleOAuthBrowserTarget(url),
        url,
      );
      logIosOAuthBrowserTarget(iosTarget, url);

      if (iosTarget.strategy !== "google_direct" || !iosTarget.url) {
        return failIosGoogleOAuthResolve(iosTarget.reason ?? "google_url_unresolved");
      }

      await logPkceStorageKeys("PKCE_KEYS_AFTER_SIGNIN");
      return openIosNativeOAuthSession(iosTarget.url, iosTarget.strategy);
    }

    const browserTargetUrl = googleOAuthNativeBrowserTargetUrl(url, "android");

    await logPkceStorageKeys("PKCE_KEYS_AFTER_SIGNIN");

    showGoogleSignInOverlay();
    await awaitGoogleSignInOverlayPaint();
    logGoogleSignInBrowserOpen();

    return openAndroidOAuthBrowser(browserTargetUrl);
  }

  console.log("GOOGLE_SIGNIN_START");
  const redirectTo = oauthRedirectUrl();
  logWebOAuthDebug("start", { redirectTo, branch: "web_skip_browser_redirect" });

  beginWebOAuthSplash();
  showGoogleSignInOverlay();
  await awaitGoogleSignInOverlayPaint();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    dismissWebOAuthSplash("oauth_url_error");
    hideGoogleSignInOverlay("oauth_url_error");
    return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
  }

  const url = typeof data?.url === "string" ? data.url.trim() : "";
  if (!url) {
    dismissWebOAuthSplash("missing_oauth_url");
    hideGoogleSignInOverlay("missing_oauth_url");
    return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
  }

  let urlHost = "(invalid)";
  try {
    urlHost = new URL(url).hostname;
  } catch {
    urlHost = url.slice(0, 64);
  }
  logWebOAuthDebug("redirect", { urlHost });
  logGoogleSignInBrowserOpen();
  window.location.assign(url);
  return { error: null };
}
