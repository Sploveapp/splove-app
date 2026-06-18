import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "./supabase";
import { env, hasGoogleNativeIosEnv } from "./env";
import { requestAuthSessionSync } from "./authSessionSyncBridge";
import { clearOauthProcessingLock } from "./oauthCallbackLock";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "./googleOAuthFlow";
import { abortGoogleSignInFlow, completePostGoogleAuth } from "./postGoogleAuthComplete";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";

let initStarted = false;
let initDone = false;

/** Feature flag Phase 2 — Google Sign-In natif iOS (@capgo/capacitor-social-login). */
export function isIosGoogleNativeEnabled(): boolean {
  return (
    import.meta.env.VITE_IOS_GOOGLE_NATIVE === "true" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios"
  );
}

export function isGoogleNativeSignInReady(): boolean {
  return initDone;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function failNativeGoogleSignIn(): { error: Error } {
  console.log("GOOGLE_SIGNIN_ERROR");
  abortGoogleSignInFlow();
  return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
}

/**
 * Initialise Google Sign-In natif iOS (Capgo SocialLogin).
 * No-op si feature flag off ou Client IDs absents.
 */
export async function initGoogleNativeSignIn(): Promise<void> {
  if (!isIosGoogleNativeEnabled()) return;
  if (!hasGoogleNativeIosEnv) {
    if (import.meta.env.DEV) {
      console.warn(
        "[GoogleNative] init skipped — set VITE_GOOGLE_IOS_CLIENT_ID and VITE_GOOGLE_WEB_CLIENT_ID",
      );
    }
    return;
  }
  if (initDone) return;
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
    await SocialLogin.initialize({
      google: {
        iOSClientId: env.googleIosClientId!,
        webClientId: env.googleWebClientId!,
        iOSServerClientId: env.googleWebClientId!,
        mode: "online",
      },
    });
    initDone = true;
    if (import.meta.env.DEV) {
      console.log("[GoogleNative] SocialLogin initialized");
    }
  } catch (e) {
    initStarted = false;
    console.warn("[GoogleNative] SocialLogin.initialize failed", e);
  }
}

/**
 * Connexion Google iOS native : SocialLogin → idToken → signInWithIdToken → post-login SPLove.
 * Pas de splash « Connexion sécurisée… » — navigation directe vers Onboarding / Move.
 */
export async function signInWithGoogleNativeIos(): Promise<{ error: Error | null }> {
  console.log("[Google Native] login start");
  console.log("GOOGLE_SIGNIN_START");

  scrubOAuthTokensFromNativeWindow("#/auth");

  try {
    await initGoogleNativeSignIn();
    if (!isGoogleNativeSignInReady()) {
      console.log("[Google Native] supabase error", "SocialLogin not initialized");
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
      console.log("[Google Native] supabase error", "missing idToken");
      return failNativeGoogleSignIn();
    }

    console.log("[Google Native] token received");

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: loginResult.result.idToken,
      nonce: rawNonce,
    });

    if (error) {
      console.log("[Google Native] supabase error", error.message);
      return failNativeGoogleSignIn();
    }

    const sessionUserId = data.session?.user?.id;
    if (!sessionUserId) {
      console.log("[Google Native] supabase error", "no session user");
      return failNativeGoogleSignIn();
    }

    console.log("[Google Native] supabase success");

    clearOauthProcessingLock();
    await requestAuthSessionSync();
    await completePostGoogleAuth(sessionUserId, "google_native_ios");
    return { error: null };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
    const message = e instanceof Error ? e.message : String(e);
    if (code === "USER_CANCELLED") {
      console.log("[Google Native] supabase error", "user cancelled");
      clearOauthProcessingLock();
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }
    console.log("[Google Native] supabase error", message);
    return failNativeGoogleSignIn();
  }
}
