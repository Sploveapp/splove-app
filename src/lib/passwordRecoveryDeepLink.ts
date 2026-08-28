import {
  isNativeCapacitorApp,
  isNativeOAuthCallbackUrl,
  isNativePasswordRecoveryUrl,
} from "./authRedirect";
import {
  establishSupabaseSessionFromOAuthCallbackUrl,
  parseCallbackAuthType,
  parseOAuthCallbackParams,
} from "./oauthCallbackParams";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";

/** Deep link récupération mot de passe en cours — évite routage OAuth / onboarding. */
let passwordRecoveryFlowActive = false;

export function isPasswordRecoveryFlowActive(): boolean {
  return passwordRecoveryFlowActive;
}

export function markPasswordRecoveryFlowActive(active: boolean): void {
  passwordRecoveryFlowActive = active;
}

function recoveryUrlHasAuthPayload(url: string): boolean {
  const params = parseOAuthCallbackParams(url);
  return params.hasCode || params.hasAccessToken;
}

export type PasswordRecoveryDeepLinkOptions = {
  /** true pendant un flux Google/Apple OAuth actif — ne pas traiter comme recovery. */
  nativeOAuthProviderActive?: boolean;
};

/**
 * True si l’URL est un retour reset password (pas OAuth sign-in).
 * Utilise splove://auth/callback autorisé par Supabase + type=recovery ou cold start sans provider OAuth.
 */
export function isPasswordRecoveryDeepLinkActionable(
  url: string,
  options?: PasswordRecoveryDeepLinkOptions,
): boolean {
  const trimmed = url.trim();
  if (!trimmed || !recoveryUrlHasAuthPayload(trimmed)) return false;

  if (options?.nativeOAuthProviderActive) return false;

  if (isNativePasswordRecoveryUrl(trimmed)) return true;

  if (isNativeOAuthCallbackUrl(trimmed)) {
    const authType = parseCallbackAuthType(trimmed);
    if (authType === "recovery") return true;
    const params = parseOAuthCallbackParams(trimmed);
    /** PKCE recovery email : code sans access_token, hors flux OAuth actif. */
    if (params.hasCode && !params.hasAccessToken) return true;
    return false;
  }

  if (isNativeCapacitorApp() && /reset-password/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Établit la session recovery depuis un deep link natif, puis ouvre /reset-password.
 * Ne pas appeler completePostGoogleAuth — ce n’est pas une connexion OAuth.
 */
export async function handlePasswordRecoveryDeepLink(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!isPasswordRecoveryDeepLinkActionable(trimmed)) return false;

  console.log("[PasswordRecovery] deep_link_received", { urlLength: trimmed.length });
  markPasswordRecoveryFlowActive(true);

  try {
    const outcome = await establishSupabaseSessionFromOAuthCallbackUrl(trimmed);
    if (!outcome.ok) {
      console.warn("[PasswordRecovery] session_failed", { error: outcome.error, method: outcome.method });
      markPasswordRecoveryFlowActive(false);
      return false;
    }

    console.log("[PasswordRecovery] session_ok", { method: outcome.method });
    scrubOAuthTokensFromNativeWindow();

    const hashTarget = "#/reset-password";
    if (window.location.hash !== hashTarget) {
      window.location.hash = hashTarget;
    }
    return true;
  } catch (e) {
    console.warn("[PasswordRecovery] unexpected_error", e instanceof Error ? e.message : e);
    markPasswordRecoveryFlowActive(false);
    return false;
  }
}
