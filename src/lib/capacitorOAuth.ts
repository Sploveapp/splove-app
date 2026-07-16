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
  signInWithAppleNative,
} from "./sploveIosGoogleOAuth";
import { completePostGoogleAuth } from "./postGoogleAuthComplete";
import { ensureProfileRowForAuthUserId } from "./authProfileSync";

export const OAUTH_BROWSER_TIMEOUT_USER_MSG = OAUTH_CALLBACK_INTERRUPTED_MSG;
export const GOOGLE_OAUTH_INTERRUPTED_MSG = GOOGLE_OAUTH_USER_ERROR_MSG;
export const SPLOVE_OAUTH_BROWSER_CLOSED_EVENT = "splove-oauth-browser-closed";

const OAUTH_CALLBACK_STORAGE_KEY = "splove_oauth_callback_url";
/** Apple OAuth : évite « Connexion sécurisée » bloqué si le callback ne termine pas. */
const APPLE_OAUTH_BROWSER_SAFETY_MS = 30_000;

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
      !iosNativeOAuthSessionActive &&
      !isOauthProcessingLocked() &&
      !isGoogleSignInOverlayMounted()
    ) {
      return;
    }
    console.log("[AppleOAuth] callback_error", { reason: "safety_timeout" });
    // Capacitor Browser uniquement si réellement ouvert — jamais pour ASWebAuthenticationSession.
    if (oauthBrowserOpen) {
      void closeOAuthBrowser().finally(() => {
        failOAuthCallback("apple_safety_timeout");
      });
      return;
    }
    failOAuthCallback("apple_safety_timeout");
  }, APPLE_OAUTH_BROWSER_SAFETY_MS);
}

function forceDismissNativeOAuthConnectingUi(trigger: string): void {
  hideIosGoogleOAuthConnectingOverlay(trigger, { force: true });
  hideGoogleSignInOverlay(trigger, { force: true });
}

function logOAuthCallbackAppUrlOpen(url: string): void {
  const trimmed = url.trim();
  const params = parseOAuthCallbackParams(trimmed);
  let protocol = "";
  let host = "";
  let pathname = "";
  try {
    const parsed = new URL(trimmed);
    protocol = parsed.protocol;
    host = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    const match = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(\/[^?#]*)?/i);
    if (match) {
      protocol = `${match[1]}:`;
      host = match[2] ?? "";
      pathname = match[3] ?? "";
    }
  }
  const hasError = oauthCallbackErrorFromUrl(trimmed).hasError;
  console.log("[OAuthCallback] app_url_open", {
    protocol,
    host,
    pathname,
    hasCode: params.hasCode,
    hasAccessToken: params.hasAccessToken,
    hasError,
  });
}

function oauthCallbackErrorFromUrl(url: string): { hasError: boolean; error: string | null } {
  const trimmed = url.trim();
  const match = trimmed.match(/(?:^|[?&#])error=([^&#]+)/i);
  if (!match?.[1]) return { hasError: false, error: null };
  try {
    return { hasError: true, error: decodeURIComponent(match[1]) };
  } catch {
    return { hasError: true, error: match[1] };
  }
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
  if (!trimmed) return false;
  const params = parseOAuthCallbackParams(trimmed);
  const hasOAuthPayload =
    params.hasCode || params.hasAccessToken || oauthCallbackErrorFromUrl(trimmed).hasError;
  if (isNativeOAuthCallbackUrl(trimmed)) {
    return hasOAuthPayload;
  }
  if (/^com\.splove\.app:/i.test(trimmed) && hasOAuthPayload) {
    return true;
  }
  if (/^splove:/i.test(trimmed) && hasOAuthPayload) {
    return true;
  }
  return false;
}

function failOAuthCallback(reason: string): void {
  console.log("OAUTH_CALLBACK_FAILED", { reason });
  const wasAppleNative = activeNativeOAuthProvider === "apple" && iosNativeOAuthSessionActive;
  if (activeNativeOAuthProvider === "apple") {
    console.log("[AppleOAuth] callback_error", { reason });
    activeNativeOAuthProvider = null;
    clearAppleOAuthSafetyTimer();
  }
  iosNativeOAuthSessionActive = false;
  // ASWebAuthenticationSession se ferme seule — ne pas Browser.close() sur flux Apple natif.
  if (oauthBrowserOpen && !wasAppleNative) {
    void closeOAuthBrowser();
  } else if (oauthBrowserOpen) {
    oauthBrowserOpen = false;
    markOAuthBrowserOpen(false);
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

  const callbackError = oauthCallbackErrorFromUrl(trimmed);
  if (callbackError.hasError) {
    if (isAppleFlow) {
      console.log("[AppleOAuth] callback_error", {
        reason: callbackError.error ?? "oauth_error",
      });
    }
    const fromNativePluginEarly =
      options.skipBrowserClose || options.source === "native_plugin" || iosNativeOAuthSessionActive;
    if (!fromNativePluginEarly) {
      await closeOAuthBrowserOnceOnCallback();
    }
    failOAuthCallback(callbackError.error ?? "oauth_callback_error");
    return false;
  }

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
    console.log("[AppleOAuth] callback_received");
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

function profileRowHasDisplayPhoto(row: Record<string, unknown> | null | undefined): boolean {
  const portrait = typeof row?.portrait_url === "string" ? row.portrait_url.trim() : "";
  const main = typeof row?.main_photo_url === "string" ? row.main_photo_url.trim() : "";
  return portrait.length > 0 || main.length > 0;
}

async function prefillAppleNativeFirstNameIfEmpty(
  userId: string,
  givenName: string | undefined,
): Promise<void> {
  const trimmed = givenName?.trim() ?? "";
  if (!trimmed) return;

  await ensureProfileRowForAuthUserId(userId);
  const { data: row, error } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[APPLE_NATIVE] first_name_prefill_skipped", { reason: "profile_read_failed" });
    return;
  }

  const existing = typeof row?.first_name === "string" ? row.first_name.trim() : "";
  if (existing) return;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ first_name: trimmed })
    .eq("id", userId);

  if (updateError) {
    console.warn("[APPLE_NATIVE] first_name_prefill_skipped", { reason: "profile_update_failed" });
  }
}

async function routeAppleNativeOnboardingPhotoFocusIfNeeded(userId: string): Promise<void> {
  const { data: row, error } = await supabase
    .from("profiles")
    .select("portrait_url, main_photo_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.log("[APPLE_NATIVE] profile_photo_audit", {
      hasPortrait: false,
      hasMain: false,
      needsPhotos: true,
      profileReadFailed: true,
    });
    return;
  }

  const profileRow = (row ?? {}) as Record<string, unknown>;
  const hasPortrait =
    typeof profileRow.portrait_url === "string" && profileRow.portrait_url.trim().length > 0;
  const hasMain =
    typeof profileRow.main_photo_url === "string" && profileRow.main_photo_url.trim().length > 0;
  const needsPhotos = !profileRowHasDisplayPhoto(profileRow);

  console.log("[APPLE_NATIVE] profile_photo_audit", {
    hasPortrait,
    hasMain,
    needsPhotos,
  });

  if (!needsPhotos) return;

  const hash = window.location.hash || "";
  if (!hash.startsWith("#/onboarding")) return;

  console.log("[APPLE_NATIVE] route_onboarding", { step: 9, reason: "missing_photos" });
  window.location.hash = "#/onboarding?focus=photos";
}

/** iOS : Sign in with Apple natif → supabase.auth.signInWithIdToken (pas d’OAuth / Browser). */
async function signInWithAppleNativeIos(): Promise<{ error: Error | null }> {
  console.log("[APPLE_NATIVE] authorization_start");

  if (isOauthProcessingLocked()) {
    console.log("[APPLE_NATIVE] error", { stage: "start", code: "oauth_callback_in_progress" });
    return { error: new Error(OAUTH_BROWSER_TIMEOUT_USER_MSG) };
  }

  const pluginAvailable = await isSploveIosGoogleOAuthAvailable();
  if (!pluginAvailable) {
    console.log("[APPLE_NATIVE] error", { stage: "start", code: "plugin_unavailable" });
    forceDismissNativeOAuthConnectingUi("apple_plugin_unavailable");
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  activeNativeOAuthProvider = "apple";
  setOauthProcessingLock();

  try {
    const credential = await signInWithAppleNative();
    const identityToken =
      typeof credential.identityToken === "string" ? credential.identityToken.trim() : "";
    const rawNonce = typeof credential.rawNonce === "string" ? credential.rawNonce.trim() : "";

    if (!identityToken || !rawNonce) {
      console.log("[APPLE_NATIVE] error", { stage: "credential", code: "missing_token_or_nonce" });
      forceDismissNativeOAuthConnectingUi("apple_missing_credential");
      activeNativeOAuthProvider = null;
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    console.log("[APPLE_NATIVE] credential_received");
    console.log("[APPLE_NATIVE] identity_token_ready");
    console.log("[APPLE_NATIVE] supabase_exchange_start");

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: identityToken,
      nonce: rawNonce,
    });

    if (error || !data.session?.user?.id) {
      console.log("[APPLE_NATIVE] error", {
        stage: "supabase_exchange",
        code: error?.code ?? "no_session",
      });
      forceDismissNativeOAuthConnectingUi("apple_id_token_exchange_failed");
      activeNativeOAuthProvider = null;
      stashAuthOAuthUserMessage(APPLE_OAUTH_USER_ERROR_MSG);
      window.location.hash = "#/auth";
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    const userId = data.session.user.id;
    console.log("[APPLE_NATIVE] session_ready");
    activeNativeOAuthProvider = null;

    await prefillAppleNativeFirstNameIfEmpty(userId, credential.givenName);

    const routed = await completePostGoogleAuth(userId, "apple_native_ios");
    if (!routed) {
      console.log("[APPLE_NATIVE] error", { stage: "routing", code: "post_auth_route_failed" });
      forceDismissNativeOAuthConnectingUi("apple_route_failed");
      return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
    }

    await routeAppleNativeOnboardingPhotoFocusIfNeeded(userId);

    forceDismissNativeOAuthConnectingUi("apple_native_success");
    return { error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code = /cancelled|canceled/i.test(message)
      ? "cancelled"
      : /missing_identity_token/i.test(message)
        ? "missing_identity_token"
        : "apple_auth_error";
    console.log("[APPLE_NATIVE] error", { stage: "authorization", code });
    activeNativeOAuthProvider = null;
    forceDismissNativeOAuthConnectingUi(code);
    if (code !== "cancelled") {
      stashAuthOAuthUserMessage(APPLE_OAUTH_USER_ERROR_MSG);
      window.location.hash = "#/auth";
    }
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  } finally {
    clearOauthProcessingLock();
  }
}

/** Android : Apple via Capacitor Browser + deep link (pas de SIWA ASAuthorization). */
async function signInWithAppleOAuthAndroid(): Promise<{ error: Error | null }> {
  activeNativeOAuthProvider = "apple";
  oauthBrowserClosedOnCallback = false;
  lastProcessedOAuthCode = null;

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
    console.log("[AppleOAuth] error", { reason: "signInWithOAuth_failed" });
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  const url = typeof data?.url === "string" ? data.url.trim() : "";
  if (!url) {
    activeNativeOAuthProvider = null;
    hideGoogleSignInOverlay("apple_missing_oauth_url");
    console.log("[AppleOAuth] error", { reason: "missing_oauth_url" });
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  if (isForbiddenOAuthRedirectTarget(url)) {
    activeNativeOAuthProvider = null;
    hideGoogleSignInOverlay("apple_forbidden_redirect");
    console.log("[AppleOAuth] error", { reason: "forbidden_redirect" });
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }

  console.log("[AppleOAuth] oauth_url_ready", { host: hostFromOAuthUrl(url) });
  await logPkceStorageKeys("PKCE_KEYS_AFTER_SIGNIN");

  try {
    oauthBrowserOpen = true;
    markOAuthBrowserOpen(true);
    await Browser.open({ url, presentationStyle: "fullscreen" });
    console.log("[AppleOAuth] browser_opened", { host: hostFromOAuthUrl(url) });
    scheduleAppleOAuthSafetyTimeout();
    return { error: null };
  } catch (e) {
    oauthBrowserOpen = false;
    activeNativeOAuthProvider = null;
    const message = e instanceof Error ? e.message : String(e);
    console.log("[AppleOAuth] error", { reason: "browser_open_failed", message });
    hideGoogleSignInOverlay("apple_browser_open_error");
    return { error: new Error(APPLE_OAUTH_USER_ERROR_MSG) };
  }
}

export async function signInWithAppleOAuth(): Promise<{ error: Error | null }> {
  console.log("[AppleOAuth] start");

  if (isGoogleOAuthNativePlatform()) {
    if (Capacitor.getPlatform() === "ios") {
      return signInWithAppleNativeIos();
    }
    return signInWithAppleOAuthAndroid();
  }

  // Web : OAuth Apple via Service ID (inchangé).
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

async function processAppUrlOpenCandidate(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  logOAuthCallbackAppUrlOpen(trimmed);

  const callbackError = oauthCallbackErrorFromUrl(trimmed);
  if (callbackError.hasError) {
    if (activeNativeOAuthProvider === "apple") {
      console.log("[AppleOAuth] callback_error", {
        reason: callbackError.error ?? "oauth_error",
      });
    }
    await closeOAuthBrowserOnceOnCallback();
    failOAuthCallback(callbackError.error ?? "oauth_callback_error");
    return;
  }

  if (!isNativeOAuthCallbackActionable(trimmed)) {
    console.log("OAUTH_APP_URL_OPEN_SKIP", { reason: "not_actionable" });
    return;
  }

  await handleNativeOAuthCallback(trimmed, { source: "app_url_open" });
}

async function recoverOAuthCallbackFromLaunchUrl(trigger: string): Promise<void> {
  try {
    const launch = await App.getLaunchUrl();
    const url = launch?.url?.trim() ?? "";
    if (!url) return;
    console.log("OAUTH_LAUNCH_URL_RECOVER", { trigger });
    await processAppUrlOpenCandidate(url);
  } catch {
    /* no launch url */
  }
}

export function initCapacitorAuthBridge(): void {
  if (capacitorAuthBridgeReady || !isGoogleOAuthNativePlatform()) return;
  capacitorAuthBridgeReady = true;
  console.log("CAPACITOR_AUTH_BRIDGE_INIT", { platform: Capacitor.getPlatform() });

  void App.addListener("appUrlOpen", (event) => {
    void processAppUrlOpenCandidate(event.url?.trim() ?? "");
  });

  void App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive || activeNativeOAuthProvider !== "apple") return;
    void recoverOAuthCallbackFromLaunchUrl("app_state_active");
  });

  void Browser.addListener("browserFinished", () => {
    oauthBrowserOpen = false;
    markOAuthBrowserOpen(false);
    if (activeNativeOAuthProvider === "apple") {
      void recoverOAuthCallbackFromLaunchUrl("browser_finished");
    }
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
