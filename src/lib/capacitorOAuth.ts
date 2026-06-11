import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { authCallbackHashRouteFromOAuthUrl } from "./oauthCallbackParams";
import {
  isForbiddenOAuthRedirectTarget,
  isGoogleOAuthNativePlatform,
  isNativeOAuthCallbackUrl,
  NATIVE_OAUTH_CALLBACK,
  NATIVE_OAUTH_CALLBACK_LEGACY,
  oauthRedirectUrl,
} from "./authRedirect";
import { isOauthProcessingLocked, setOauthProcessingLock } from "./oauthCallbackLock";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "./googleOAuthFlow";
import { dismissPostOAuthSplash } from "./postOAuthSplash";

const OAUTH_CALLBACK_STORAGE_KEY = "splove_oauth_callback_url";
export const SPLOVE_OAUTH_BROWSER_CLOSED_EVENT = "splove-oauth-browser-closed";

/** iOS only — test: window-location | browser-fullscreen | supabase-redirect */
type IosGoogleOAuthOpenMode = "window-location" | "browser-fullscreen" | "supabase-redirect";
const IOS_GOOGLE_OAUTH_OPEN_MODE: IosGoogleOAuthOpenMode = "browser-fullscreen";

export const GOOGLE_OAUTH_INTERRUPTED_MSG = GOOGLE_OAUTH_USER_ERROR_MSG;

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

export function subscribeGoogleOAuthBrowserTimeout(
  _onTimeout: (message: string) => void,
): () => void {
  return () => undefined;
}

export function isGoogleOAuthInFlight(): boolean {
  return false;
}

export function releaseGoogleOAuthFlowLock(): void {
  /* no-op — rollback flux OAuth simple */
}

async function closeOAuthBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    /* ignore */
  }
}

function logUrlForXcode(label: string, url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    console.log(label, "(empty)");
    return;
  }
  const schemeEnd = trimmed.indexOf("://");
  if (schemeEnd >= 0) {
    console.log(label, trimmed.slice(0, schemeEnd + 1), "//" + trimmed.slice(schemeEnd + 3));
    return;
  }
  console.log(label, trimmed);
}

function logGoogleAuthUrlDiagnostics(url: string, prefix: string): void {
  logUrlForXcode(`${prefix}_FULL`, url);
  if (prefix === "GOOGLE_AUTH_URL") {
    logUrlForXcode("GOOGLE_AUTH_URL_FULL", url);
  }

  const hasProviderGoogle =
    /(?:[?&]provider=google(?:&|$)|\/authorize\/google)/i.test(url);
  console.log(`${prefix}_HAS_PROVIDER_GOOGLE`, hasProviderGoogle);

  const encodedRedirect = encodeURIComponent(NATIVE_OAUTH_CALLBACK);
  const hasRedirectEncoded =
    url.includes("redirect_to=") &&
    (url.includes(encodedRedirect) || url.includes("splove%3A%2F%2Fauth%2Fcallback"));
  console.log(`${prefix}_HAS_REDIRECT_TO_SPLove_ENCODED`, hasRedirectEncoded);

  let redirectTo: string | null = null;
  try {
    redirectTo = new URL(url).searchParams.get("redirect_to");
  } catch {
    redirectTo = null;
  }

  const redirectMatchesNative =
    redirectTo === NATIVE_OAUTH_CALLBACK || redirectTo === NATIVE_OAUTH_CALLBACK_LEGACY;
  console.log(`${prefix}_REDIRECT_TO_MATCHES_NATIVE`, redirectMatchesNative);
  if (redirectTo) {
    logUrlForXcode(`${prefix}_REDIRECT_TO_DECODED`, redirectTo);
  } else {
    console.log(`${prefix}_REDIRECT_TO_DECODED`, "(null)");
  }

  console.log(`${prefix}_URL_LENGTH`, url.length);
  console.log(`${prefix}_URL_HAS_QUERY`, url.includes("?"));
}

export async function closeCapacitorOAuthBrowser(): Promise<void> {
  await closeOAuthBrowser();
}

async function routeOAuthDeepLink(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    console.log("OAUTH_RETURN_SKIP", "empty_url");
    return;
  }
  if (!isNativeOAuthCallbackUrl(trimmed)) {
    console.log("OAUTH_RETURN_SKIP", "not_native_callback");
    logUrlForXcode("OAUTH_RETURN_SKIP_URL", trimmed);
    return;
  }

  logUrlForXcode("OAUTH_RETURN", trimmed);

  await closeOAuthBrowser();
  stashOAuthCallbackUrl(trimmed);
  setOauthProcessingLock();

  const hashRoute = authCallbackHashRouteFromOAuthUrl(trimmed);
  const hash = hashRoute.startsWith("#") ? hashRoute : `#${hashRoute}`;
  window.location.hash = hash;
}

let capacitorAuthBridgeReady = false;

export function initCapacitorAuthBridge(): void {
  if (capacitorAuthBridgeReady || !isGoogleOAuthNativePlatform()) return;
  capacitorAuthBridgeReady = true;

  void App.addListener("appUrlOpen", (event) => {
    const opened = event.url?.trim() ?? "";
    console.log("APP_URL_OPEN_RECEIVED", true);
    logUrlForXcode("APP_URL_OPEN", opened);
    void routeOAuthDeepLink(event.url);
  });

  void Browser.addListener("browserFinished", () => {
    console.log("OAUTH_BROWSER_FINISHED");
    if (isOauthProcessingLocked()) return;
    dismissPostOAuthSplash();
    window.dispatchEvent(new CustomEvent(SPLOVE_OAUTH_BROWSER_CLOSED_EVENT));
  });
}

export async function signInWithGoogleOAuth(): Promise<{ error: Error | null }> {
  if (isGoogleOAuthNativePlatform()) {
    console.log("GOOGLE_SIGNIN_START");

    const isIos = Capacitor.getPlatform() === "ios";
    const openMode: IosGoogleOAuthOpenMode = isIos ? IOS_GOOGLE_OAUTH_OPEN_MODE : "browser-fullscreen";
    const useSupabaseRedirect = openMode === "supabase-redirect";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_OAUTH_CALLBACK,
        skipBrowserRedirect: !useSupabaseRedirect,
      },
    });

    if (error) {
      console.log("GOOGLE_AUTH_URL", error.message);
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    const url = typeof data?.url === "string" ? data.url.trim() : "";
    logGoogleAuthUrlDiagnostics(url, "GOOGLE_AUTH_URL");
    if (!url) {
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    if (isForbiddenOAuthRedirectTarget(url)) {
      console.error("GOOGLE_AUTH_URL_FORBIDDEN_REDIRECT", "redirect_to points to localhost");
      return { error: new Error(GOOGLE_OAUTH_USER_ERROR_MSG) };
    }

    console.log("OAUTH_OPEN_MODE", openMode);
    logGoogleAuthUrlDiagnostics(url, "BROWSER_OPEN");
    console.log("BROWSER_OPEN_START");

    if (useSupabaseRedirect) {
      // signInWithOAuth a déjà appelé window.location.assign(url) côté client Supabase.
      console.log("BROWSER_OPEN_DONE");
      return { error: null };
    }

    if (openMode === "window-location") {
      window.location.href = url;
    } else {
      await Browser.open({ url, presentationStyle: "fullscreen" });
    }

    console.log("BROWSER_OPEN_DONE");
    return { error: null };
  }

  console.log("GOOGLE_SIGNIN_START");
  const redirectTo = oauthRedirectUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) {
    console.log("GOOGLE_AUTH_URL", error.message);
  }
  return { error: error ?? null };
}
