import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "./supabase";
import { env, hasGoogleNativeAndroidEnv, hasGoogleNativeIosEnv } from "./env";
import { requestAuthSessionSync } from "./authSessionSyncBridge";
import { clearOauthProcessingLock } from "./oauthCallbackLock";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "./googleOAuthFlow";
import { abortGoogleSignInFlow, completePostGoogleAuth } from "./postGoogleAuthComplete";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import { isNativeCapacitorApp } from "./authRedirect";

let initStarted = false;
let initDone = false;
let initPlatform: "ios" | "android" | null = null;

/** Feature flag Phase 2 — Google Sign-In natif iOS (@capgo/capacitor-social-login). */
export function isIosGoogleNativeEnabled(): boolean {
  return (
    import.meta.env.VITE_IOS_GOOGLE_NATIVE === "true" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios"
  );
}

/**
 * Android natif : Credential Manager via Capgo.
 * Inclut le cas rare où Capacitor renvoie "web" dans la WebView Android.
 */
export function isAndroidGoogleNativeEnabled(): boolean {
  const platform = Capacitor.getPlatform();
  if (platform === "android") return true;
  if (platform === "ios") return false;
  // WebView Capacitor parfois reportée "web" — confirmer via UA Android.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (!/android/i.test(ua)) return false;
  return Capacitor.isNativePlatform() || isNativeCapacitorApp();
}

export function isGoogleNativeSignInReady(): boolean {
  return initDone;
}

/** Test helper — réinitialise l’état d’init. */
export function resetGoogleNativeSignInForTests(): void {
  initStarted = false;
  initDone = false;
  initPlatform = null;
}

function logAndroidGoogleDiag(event: string, extra?: Record<string, unknown>): void {
  const webClientId = env.googleWebClientId?.trim() ?? "";
  const payload = {
    platform: Capacitor.getPlatform(),
    isNativePlatform: Capacitor.isNativePlatform(),
    isNativeCapacitorApp: isNativeCapacitorApp(),
    hasWebClientId: Boolean(webClientId),
    webClientIdPrefix: webClientId ? `${webClientId.slice(0, 12)}…` : "(missing)",
    initDone,
    initPlatform,
    ...extra,
  };
  console.log(event, payload);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function failNativeGoogleSignIn(detail?: string): { error: Error } {
  console.log("GOOGLE_NATIVE_ERROR", { detail: detail ?? "unknown" });
  console.log("GOOGLE_SIGNIN_ERROR", detail ? { detail } : undefined);
  abortGoogleSignInFlow();
  return {
    error: new Error(
      detail?.trim()
        ? `Connexion Google native échouée : ${detail.trim()}`
        : GOOGLE_OAUTH_USER_ERROR_MSG,
    ),
  };
}

function isUserCancelled(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
  const message = e instanceof Error ? e.message : String(e);
  return (
    code === "USER_CANCELLED" ||
    /cancel|cancelled|canceled|user_canceled|128/i.test(message)
  );
}

function extractNativeError(e: unknown): { code: string; message: string } {
  const code =
    e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code ?? "") : "";
  const message = e instanceof Error ? e.message : String(e);
  return { code: code || "(none)", message: message || "(empty)" };
}

/**
 * Initialise Google Sign-In natif (Capgo SocialLogin).
 * - iOS : flag + Client IDs iOS/Web
 * - Android : Client ID Web uniquement (idToken audience = Web client → Supabase)
 */
export async function initGoogleNativeSignIn(): Promise<void> {
  const forIos = isIosGoogleNativeEnabled();
  const forAndroid = isAndroidGoogleNativeEnabled();

  if (!forIos && !forAndroid) return;

  if (forIos && !hasGoogleNativeIosEnv) {
    if (import.meta.env.DEV) {
      console.warn(
        "[GoogleNative] init skipped — set VITE_GOOGLE_IOS_CLIENT_ID and VITE_GOOGLE_WEB_CLIENT_ID",
      );
    }
    return;
  }

  if (forAndroid && !hasGoogleNativeAndroidEnv) {
    logAndroidGoogleDiag("GOOGLE_NATIVE_ERROR", {
      reason: "missing_VITE_GOOGLE_WEB_CLIENT_ID",
    });
    console.warn(
      "[GoogleNative] Android init skipped — set VITE_GOOGLE_WEB_CLIENT_ID (Web client ID for Supabase idToken)",
    );
    return;
  }

  if (initDone && (initPlatform === "android" || initPlatform === "ios")) {
    if (forAndroid && initPlatform === "android") return;
    if (forIos && initPlatform === "ios") return;
  }
  if (initStarted) {
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (initDone || !initStarted) resolve();
        else window.setTimeout(tick, 50);
      };
      tick();
    });
    return;
  }
  initStarted = true;

  try {
    if (forAndroid) {
      logAndroidGoogleDiag("GOOGLE_NATIVE_INIT_START");
      await SocialLogin.initialize({
        google: {
          webClientId: env.googleWebClientId!,
          mode: "online",
        },
      });
      initPlatform = "android";
      logAndroidGoogleDiag("GOOGLE_NATIVE_INIT_OK");
    } else {
      await SocialLogin.initialize({
        google: {
          iOSClientId: env.googleIosClientId!,
          webClientId: env.googleWebClientId!,
          iOSServerClientId: env.googleWebClientId!,
          mode: "online",
        },
      });
      initPlatform = "ios";
    }
    initDone = true;
  } catch (e) {
    initStarted = false;
    initDone = false;
    initPlatform = null;
    const err = extractNativeError(e);
    logAndroidGoogleDiag("GOOGLE_NATIVE_ERROR", {
      phase: "initialize",
      code: err.code,
      message: err.message,
    });
    console.warn("[GoogleNative] SocialLogin.initialize failed", e);
  }
}

async function exchangeGoogleIdTokenWithSupabase(
  idToken: string,
  rawNonce: string | undefined,
  reason: "google_native_ios" | "google_native_android",
): Promise<{ error: Error | null }> {
  console.log("GOOGLE_NATIVE_TOKEN_RECEIVED", { platform: reason });

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    ...(rawNonce ? { nonce: rawNonce } : {}),
  });

  if (error) {
    console.log("GOOGLE_NATIVE_ERROR", {
      phase: "signInWithIdToken",
      message: error.message,
    });
    return failNativeGoogleSignIn(error.message);
  }

  const sessionUserId = data.session?.user?.id;
  if (!sessionUserId) {
    console.log("GOOGLE_NATIVE_ERROR", { phase: "signInWithIdToken", message: "no_session_user" });
    return failNativeGoogleSignIn("no_session_user");
  }

  console.log("GOOGLE_NATIVE_SUCCESS", { platform: reason });

  clearOauthProcessingLock();
  await requestAuthSessionSync();
  await completePostGoogleAuth(sessionUserId, reason);
  return { error: null };
}

/**
 * Connexion Google iOS native : SocialLogin → idToken → signInWithIdToken → post-login SPLove.
 */
export async function signInWithGoogleNativeIos(): Promise<{ error: Error | null }> {
  console.log("[Google Native] login start");
  console.log("GOOGLE_SIGNIN_START");

  scrubOAuthTokensFromNativeWindow("#/auth");

  try {
    await initGoogleNativeSignIn();
    if (!isGoogleNativeSignInReady()) {
      console.log("GOOGLE_NATIVE_ERROR", { phase: "ios", message: "SocialLogin not initialized" });
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    const rawNonce = crypto.randomUUID();
    const nonceDigest = await sha256Hex(rawNonce);

    const loginResult = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
        nonce: nonceDigest,
        forcePrompt: true,
      },
    });

    if (loginResult.result.responseType !== "online" || !loginResult.result.idToken?.trim()) {
      console.log("GOOGLE_NATIVE_ERROR", { phase: "ios", message: "missing_id_token" });
      return failNativeGoogleSignIn("missing_id_token");
    }

    return exchangeGoogleIdTokenWithSupabase(
      loginResult.result.idToken,
      rawNonce,
      "google_native_ios",
    );
  } catch (e) {
    if (isUserCancelled(e)) {
      console.log("GOOGLE_NATIVE_ERROR", { phase: "ios", message: "USER_CANCELLED" });
      clearOauthProcessingLock();
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }
    const err = extractNativeError(e);
    console.log("GOOGLE_NATIVE_ERROR", { phase: "ios", ...err });
    return failNativeGoogleSignIn(`${err.code}: ${err.message}`);
  }
}

/**
 * Connexion Google Android native (Credential Manager) — aucun Custom Tab.
 */
export async function signInWithGoogleNativeAndroid(): Promise<{ error: Error | null }> {
  console.log("GOOGLE_NATIVE_START");
  console.log("GOOGLE_SIGNIN_START");
  logAndroidGoogleDiag("GOOGLE_NATIVE_START");

  scrubOAuthTokensFromNativeWindow("#/auth");

  if (!hasGoogleNativeAndroidEnv) {
    const msg =
      "VITE_GOOGLE_WEB_CLIENT_ID manquant dans la build Android. Ajoute le Client ID Web Google Cloud puis rebuild.";
    console.log("GOOGLE_NATIVE_ERROR", { phase: "env", message: msg });
    return { error: new Error(msg) };
  }

  try {
    await initGoogleNativeSignIn();
    if (!isGoogleNativeSignInReady()) {
      const msg =
        "SocialLogin.initialize a échoué. Vérifie Client ID Web + SHA-1/SHA-256 (package com.splove.app) dans Google Cloud.";
      console.log("GOOGLE_NATIVE_ERROR", { phase: "init", message: msg });
      return { error: new Error(msg) };
    }

    const loginResult = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
        forcePrompt: true,
      },
    });

    if (loginResult.result.responseType !== "online" || !loginResult.result.idToken?.trim()) {
      console.log("GOOGLE_NATIVE_ERROR", { phase: "login", message: "missing_id_token" });
      return failNativeGoogleSignIn("missing_id_token");
    }

    return exchangeGoogleIdTokenWithSupabase(
      loginResult.result.idToken,
      undefined,
      "google_native_android",
    );
  } catch (e) {
    if (isUserCancelled(e)) {
      console.log("GOOGLE_NATIVE_ERROR", {
        phase: "login",
        code: "USER_CANCELLED",
        message: "user cancelled account picker",
      });
      clearOauthProcessingLock();
      return { error: new Error("Connexion Google annulée.") };
    }
    const err = extractNativeError(e);
    console.log("GOOGLE_NATIVE_ERROR", { phase: "login", ...err });
    return failNativeGoogleSignIn(`${err.code}: ${err.message}`);
  }
}
