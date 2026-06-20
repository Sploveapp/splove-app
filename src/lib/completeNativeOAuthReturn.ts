import { supabase } from "./supabase";
import { requestAuthSessionSync } from "./authSessionSyncBridge";
import { establishSupabaseSessionFromOAuthCallbackUrl } from "./oauthCallbackParams";
import {
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import { clearOAuthCallbackUrl } from "./oauthCallbackUrlStash";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import { isNativeCapacitorApp } from "./authRedirect";
import { abortGoogleSignInFlow, completePostGoogleAuth } from "./postGoogleAuthComplete";

let nativeOAuthReturnInFlight = false;

export function isNativeOAuthReturnInFlight(): boolean {
  return nativeOAuthReturnInFlight;
}

/**
 * Traite le retour OAuth natif (splove://…) sans exposer #/auth/callback ni tokens dans le WebView.
 */
export async function completeNativeOAuthReturn(deepLinkUrl: string): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false;
  if (nativeOAuthReturnInFlight) {
    console.log("NATIVE_OAUTH_RETURN_SKIP", "in_flight");
    return false;
  }
  nativeOAuthReturnInFlight = true;

  setOauthProcessingLock();

  try {
    if (import.meta.env.DEV) {
      console.log("NATIVE_OAUTH_RETURN_START");
    }

    const sessionOutcome = await establishSupabaseSessionFromOAuthCallbackUrl(deepLinkUrl);
    if (!sessionOutcome.ok) {
      console.log("GOOGLE_SIGNIN_ERROR");
      if (import.meta.env.DEV) {
        console.warn("[NativeOAuth] session failed", sessionOutcome.method, sessionOutcome.error);
      }
      abortGoogleSignInFlow();
      return false;
    }
    console.log("SESSION_SET_OR_EXCHANGE_OK", { method: sessionOutcome.method });
    scrubOAuthTokensFromNativeWindow("#/auth");

    const synced = await requestAuthSessionSync();
    if (!synced) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.log("GOOGLE_SIGNIN_ERROR");
        if (import.meta.env.DEV) {
          console.warn("[NativeOAuth] no session after exchange");
        }
        abortGoogleSignInFlow();
        return false;
      }
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sessionUserId = session?.user?.id;
    if (!sessionUserId) {
      console.log("GOOGLE_SIGNIN_ERROR");
      abortGoogleSignInFlow();
      return false;
    }

    clearOAuthCallbackUrl();
    return await completePostGoogleAuth(sessionUserId, "native_oauth_return");
  } catch (e) {
    console.log("GOOGLE_SIGNIN_ERROR");
    if (import.meta.env.DEV) {
      console.warn("[NativeOAuth] unexpected error", e instanceof Error ? e.message : e);
    }
    abortGoogleSignInFlow();
    return false;
  } finally {
    nativeOAuthReturnInFlight = false;
  }
}
