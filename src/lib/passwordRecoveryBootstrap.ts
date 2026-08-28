import { supabase } from "./supabase";
import { getPublicAppOrigin, isNativeCapacitorApp } from "./authRedirect";
import {
  handlePasswordRecoveryDeepLink,
  isPasswordRecoveryDeepLinkActionable,
  isPasswordRecoveryFlowActive,
  markPasswordRecoveryFlowActive,
} from "./passwordRecoveryDeepLink";
import {
  establishSupabaseSessionFromOAuthCallbackUrl,
  parseCallbackAuthType,
} from "./oauthCallbackParams";

let bootstrapPromise: Promise<boolean> | null = null;

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

  const hasAuthPayload =
    /access_token=/.test(combined) ||
    /refresh_token=/.test(combined) ||
    /[?&#]code=/.test(combined);

  if (!hasAuthPayload) return false;

  if (isPasswordRecoveryDeepLinkActionable(href, { nativeOAuthProviderActive: false })) {
    return true;
  }

  /** PKCE / implicit à la racine du site (Site URL Supabase sans hash route). */
  if (pathname === "/" || pathname === "" || pathname.endsWith("/index.html")) {
    if (!/^#\/auth\/callback/i.test(hash)) return true;
  }

  /** Hash Supabase brut (#access_token=…) sans route HashRouter — recovery email web. */
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

/**
 * Au boot : inspecte l’URL + session, établit la session recovery si besoin, force /reset-password.
 * Idempotent — safe avant le montage React.
 */
export async function bootstrapPasswordRecoveryFromUrl(): Promise<boolean> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    if (typeof window === "undefined") return false;

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

    const looksLikeRecovery =
      urlIndicatesPasswordRecovery(incoming) ||
      parseCallbackAuthType(incoming) === "recovery";
    if (!looksLikeRecovery && !isPasswordRecoveryDeepLinkActionable(incoming)) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && isPasswordRecoveryFlowActive()) {
        scrubToResetPasswordRoute();
        console.log("[PASSWORD_RECOVERY] showing reset screen = true (session active)");
        return true;
      }
      console.log("[PASSWORD_RECOVERY] recovery detected = false");
      return false;
    }

    console.log("[PASSWORD_RECOVERY] recovery detected = true");
    markPasswordRecoveryFlowActive(true);

    if (
      isNativeCapacitorApp() &&
      isPasswordRecoveryDeepLinkActionable(incoming, { nativeOAuthProviderActive: false })
    ) {
      const handled = await handlePasswordRecoveryDeepLink(incoming);
      console.log("[PASSWORD_RECOVERY] showing reset screen =", handled);
      return handled;
    }

    const authType = parseCallbackAuthType(incoming);
    console.log("[PASSWORD_RECOVERY] auth event = (pre-session)", { authType });

    const outcome = await establishSupabaseSessionFromOAuthCallbackUrl(incoming);
    console.log("[PASSWORD_RECOVERY] session establish", outcome);

    if (!outcome.ok) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        console.warn("[PASSWORD_RECOVERY] session missing after establish");
        markPasswordRecoveryFlowActive(false);
        return false;
      }
      console.log("[PASSWORD_RECOVERY] session present via detectSessionInUrl fallback");
    }

    scrubToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true");
    return true;
  })();

  return bootstrapPromise;
}

export function logPasswordRecoveryRedirectTo(redirectTo: string): void {
  console.log("[PASSWORD_RECOVERY] reset redirectTo =", redirectTo);
  console.log("[PASSWORD_RECOVERY] public app origin =", getPublicAppOrigin());
}
