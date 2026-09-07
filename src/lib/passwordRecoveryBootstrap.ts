import { App } from "@capacitor/app";
import { supabase } from "./supabase";
import { getPublicAppOrigin, isNativeCapacitorApp } from "./authRedirect";
import {
  handlePasswordRecoveryDeepLink,
  isPasswordRecoveryDeepLinkActionable,
  isPasswordRecoveryFlowActive,
  wasPasswordRecoveryDeepLinkHandled,
} from "./passwordRecoveryDeepLink";
import { isPasswordRecoveryErrorUrl, parsePasswordRecoveryUrl } from "./passwordRecoveryVerifyOtp";
import { isWebPasswordRecoveryBridgePage } from "./passwordRecoveryWebBridge";

let bootstrapPromise: Promise<boolean> | null = null;
let passwordRecoveryListenerReady = false;
let pendingPasswordRecoveryUrl: string | null = null;

export function getPendingPasswordRecoveryUrl(): string | null {
  return pendingPasswordRecoveryUrl;
}

/**
 * Écoute appUrlOpen le plus tôt possible — avant bootstrap OAuth/React.
 * Indispensable quand l’app reprend depuis ForgotPassword (Safari → splove://).
 */
export function initPasswordRecoveryDeepLinkListener(): void {
  if (passwordRecoveryListenerReady || !isNativeCapacitorApp()) return;
  passwordRecoveryListenerReady = true;
  console.log("[PASSWORD_RECOVERY] deep link listener init");

  void App.addListener("appUrlOpen", (event) => {
    const url = event.url?.trim() ?? "";
    if (!url) return;
    console.log("[PASSWORD_RECOVERY] appUrlOpen received =", url.slice(0, 512));
    if (
      !isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: false }) &&
      !isPasswordRecoveryErrorUrl(url)
    ) {
      return;
    }
    pendingPasswordRecoveryUrl = url;
    void handlePasswordRecoveryDeepLink(url).then((handled) => {
      if (handled && wasPasswordRecoveryDeepLinkHandled()) {
        pendingPasswordRecoveryUrl = null;
      }
    });
  });

  void App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    console.log("[PASSWORD_RECOVERY] app foreground", {
      flowActive: isPasswordRecoveryFlowActive(),
      pending: Boolean(pendingPasswordRecoveryUrl),
      handled: wasPasswordRecoveryDeepLinkHandled(),
      hash: window.location.hash,
    });
    if (wasPasswordRecoveryDeepLinkHandled()) {
      pendingPasswordRecoveryUrl = null;
      if (isPasswordRecoveryFlowActive() && !/^#\/reset-password/.test(window.location.hash)) {
        scrubToResetPasswordRoute();
      }
      window.dispatchEvent(new CustomEvent("splove:password-recovery:navigate"));
      return;
    }
    if (pendingPasswordRecoveryUrl) {
      void handlePasswordRecoveryDeepLink(pendingPasswordRecoveryUrl).then((handled) => {
        if (handled && wasPasswordRecoveryDeepLinkHandled()) {
          pendingPasswordRecoveryUrl = null;
        }
      });
      return;
    }
    if (isPasswordRecoveryFlowActive()) {
      if (!/^#\/reset-password/.test(window.location.hash)) {
        scrubToResetPasswordRoute();
      }
      window.dispatchEvent(new CustomEvent("splove:password-recovery:navigate"));
    }
  });
}

export async function processPendingPasswordRecoveryDeepLink(): Promise<boolean> {
  const url = pendingPasswordRecoveryUrl;
  if (!url) return false;
  if (wasPasswordRecoveryDeepLinkHandled()) {
    pendingPasswordRecoveryUrl = null;
    return true;
  }
  const handled = await handlePasswordRecoveryDeepLink(url);
  if (handled && wasPasswordRecoveryDeepLinkHandled()) {
    pendingPasswordRecoveryUrl = null;
  }
  return handled;
}

/** URL capturée au chargement du module — avant toute mutation HashRouter / redirect. */
const bootIncomingHref =
  typeof window !== "undefined" ? window.location.href : "";

/** URL courante contient des signaux Supabase de reset password. */
export function urlIndicatesPasswordRecovery(url?: string): boolean {
  if (typeof window === "undefined" && !url) return false;

  let href: string;
  let search: string;
  let hash: string;
  let pathname: string;

  if (url) {
    try {
      const parsed = new URL(url);
      href = url;
      search = parsed.search;
      hash = parsed.hash;
      pathname = parsed.pathname;
    } catch {
      href = url;
      search = "";
      hash = "";
      pathname = "";
    }
  } else {
    href = window.location.href;
    search = window.location.search;
    hash = window.location.hash;
    pathname = window.location.pathname;
  }

  const combined = `${href}${search}${hash}`.toLowerCase();

  if (/type=recovery/.test(combined)) return true;
  if (/token_hash=/.test(combined)) return true;
  if (/#\/reset-password/.test(combined)) return true;
  if (/error_code=otp_expired/.test(combined)) return true;

  const recoveryParams = parsePasswordRecoveryUrl(href);
  if (recoveryParams.tokenHash) return true;
  if (isPasswordRecoveryErrorUrl(href)) return true;

  const hasAuthPayload =
    /access_token=/.test(combined) ||
    /refresh_token=/.test(combined) ||
    /[?&#]code=/.test(combined);

  if (!hasAuthPayload) return false;

  if (isPasswordRecoveryDeepLinkActionable(href, { nativeOAuthProviderActive: false })) {
    return true;
  }

  if (pathname === "/" || pathname === "" || pathname.endsWith("/index.html")) {
    if (!/^#\/auth\/callback/i.test(hash)) return true;
  }

  if (hash && /^#(access_token|code)=/i.test(hash)) return true;

  return false;
}

function scrubToResetPasswordRoute(): void {
  const target = "#/reset-password";
  if (isNativeCapacitorApp()) {
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
    return;
  }
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  window.history.replaceState(null, "", `${base}${target}`);
}

async function processRecoveryUrl(incoming: string): Promise<boolean> {
  if (wasPasswordRecoveryDeepLinkHandled()) {
    if (!/^#\/reset-password/.test(window.location.hash)) {
      scrubToResetPasswordRoute();
    }
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (already handled)");
    return true;
  }

  if (
    isPasswordRecoveryDeepLinkActionable(incoming, { nativeOAuthProviderActive: false }) ||
    isPasswordRecoveryErrorUrl(incoming) ||
    urlIndicatesPasswordRecovery(incoming)
  ) {
    console.log("[PASSWORD_RECOVERY] recovery detected = true");
    return handlePasswordRecoveryDeepLink(incoming);
  }

  return false;
}

/** Cold start natif : splove://… via App.getLaunchUrl (pas dans window.location). */
export async function bootstrapPasswordRecoveryFromLaunchUrl(): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false;
  try {
    const launch = await App.getLaunchUrl();
    const url = launch?.url?.trim() ?? "";
    if (!url) return false;
    console.log("[PASSWORD_RECOVERY] launch URL =", url.slice(0, 512));
    return processRecoveryUrl(url);
  } catch {
    return false;
  }
}

/**
 * Au boot : inspecte l’URL + session, verifyOtp si token_hash, force /reset-password.
 * Idempotent — safe avant le montage React.
 */
export async function bootstrapPasswordRecoveryFromUrl(): Promise<boolean> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    if (typeof window === "undefined") return false;

    if (isWebPasswordRecoveryBridgePage()) {
      console.log("[PASSWORD_RECOVERY] web bridge page — skip verifyOtp (native only)");
      return false;
    }

    const incoming = bootIncomingHref || window.location.href;
    console.log("[PASSWORD_RECOVERY] incoming URL =", incoming);

    if (isPasswordRecoveryFlowActive()) {
      console.log("[PASSWORD_RECOVERY] recovery detected = true (already active)");
      if (!/^#\/reset-password/.test(window.location.hash)) {
        scrubToResetPasswordRoute();
      }
      console.log("[PASSWORD_RECOVERY] showing reset screen = true");
      return true;
    }

    const fromWindow = await processRecoveryUrl(incoming);
    if (fromWindow) return fromWindow;

    const fromLaunch = await bootstrapPasswordRecoveryFromLaunchUrl();
    if (fromLaunch) return fromLaunch;

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id && isPasswordRecoveryFlowActive()) {
      scrubToResetPasswordRoute();
      console.log("[PASSWORD_RECOVERY] showing reset screen = true (session active)");
      return true;
    }

    console.log("[PASSWORD_RECOVERY] recovery detected = false");
    return false;
  })();

  return bootstrapPromise;
}

export function logPasswordRecoveryRedirectTo(redirectTo: string): void {
  console.log("[PASSWORD_RECOVERY] reset redirectTo =", redirectTo);
  console.log("[PASSWORD_RECOVERY] public app origin =", getPublicAppOrigin());
}
