import {
  isNativeCapacitorApp,
  isNativeOAuthCallbackUrl,
  isNativePasswordRecoveryUrl,
  isNativePasswordResetUrl,
} from "./authRedirect";
import {
  establishSupabaseSessionFromOAuthCallbackUrl,
  parseCallbackAuthType,
  parseOAuthCallbackParams,
} from "./oauthCallbackParams";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import {
  isPasswordRecoveryErrorUrl,
  parsePasswordRecoveryUrl,
  passwordRecoveryInvalidLinkMessage,
  verifyPasswordRecoveryOtp,
} from "./passwordRecoveryVerifyOtp";

/** Deep link récupération mot de passe en cours — évite routage OAuth / onboarding. */
let passwordRecoveryFlowActive = false;
let passwordRecoveryError: string | null = null;
let passwordRecoveryDeepLinkHandled = false;

export function isPasswordRecoveryFlowActive(): boolean {
  return passwordRecoveryFlowActive;
}

export function markPasswordRecoveryFlowActive(active: boolean): void {
  passwordRecoveryFlowActive = active;
  if (!active) {
    passwordRecoveryError = null;
  }
}

export function getPasswordRecoveryError(): string | null {
  return passwordRecoveryError;
}

export function setPasswordRecoveryError(message: string | null): void {
  passwordRecoveryError = message;
}

export function wasPasswordRecoveryDeepLinkHandled(): boolean {
  return passwordRecoveryDeepLinkHandled;
}

function navigateToResetPasswordRoute(): void {
  const hashTarget = "#/reset-password";
  if (window.location.hash !== hashTarget) {
    window.location.hash = hashTarget;
  }
}

function recoveryUrlHasActionablePayload(url: string): boolean {
  const recoveryParams = parsePasswordRecoveryUrl(url);
  if (recoveryParams.tokenHash) return true;
  if (isPasswordRecoveryErrorUrl(url)) return true;
  const params = parseOAuthCallbackParams(url);
  return params.hasCode || params.hasAccessToken;
}

export type PasswordRecoveryDeepLinkOptions = {
  /** true pendant un flux Google/Apple OAuth actif — ne pas traiter comme recovery. */
  nativeOAuthProviderActive?: boolean;
};

/**
 * True si l’URL est un retour reset password (token_hash, erreur otp_expired, legacy tokens).
 */
export function isPasswordRecoveryDeepLinkActionable(
  url: string,
  options?: PasswordRecoveryDeepLinkOptions,
): boolean {
  const trimmed = url.trim();
  if (!trimmed || !recoveryUrlHasActionablePayload(trimmed)) return false;

  if (options?.nativeOAuthProviderActive) return false;

  if (isNativePasswordResetUrl(trimmed)) {
    const parsed = parsePasswordRecoveryUrl(trimmed);
    return Boolean(parsed.tokenHash) || isPasswordRecoveryErrorUrl(trimmed);
  }

  if (isPasswordRecoveryErrorUrl(trimmed) && !options?.nativeOAuthProviderActive) {
    if (isNativeOAuthCallbackUrl(trimmed) || isNativePasswordResetUrl(trimmed)) {
      return true;
    }
  }

  const recoveryParams = parsePasswordRecoveryUrl(trimmed);
  if (recoveryParams.tokenHash && recoveryParams.type === "recovery") return true;
  if (recoveryParams.tokenHash && isNativePasswordResetUrl(trimmed)) return true;

  if (isNativePasswordRecoveryUrl(trimmed)) return true;

  if (isNativeOAuthCallbackUrl(trimmed)) {
    const authType = parseCallbackAuthType(trimmed);
    if (authType === "recovery") return true;
    const params = parseOAuthCallbackParams(trimmed);
    if (params.hasCode && !params.hasAccessToken) return true;
    return false;
  }

  if (isNativeCapacitorApp() && /reset-password/i.test(trimmed) && recoveryParams.tokenHash) {
    return true;
  }

  return false;
}

/**
 * token_hash + verifyOtp, ou erreur otp_expired → écran reset (pas login).
 * Fallback legacy : access_token / code via establishSupabaseSessionFromOAuthCallbackUrl.
 */
export async function handlePasswordRecoveryDeepLink(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (
    !isPasswordRecoveryDeepLinkActionable(trimmed, { nativeOAuthProviderActive: false }) &&
    !isPasswordRecoveryErrorUrl(trimmed)
  ) {
    return false;
  }

  if (passwordRecoveryDeepLinkHandled && isPasswordRecoveryFlowActive()) {
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (already handled)");
    return true;
  }

  const parsed = parsePasswordRecoveryUrl(trimmed);
  console.log("[PasswordRecovery] deep_link_received", {
    urlLength: trimmed.length,
    hasTokenHash: Boolean(parsed.tokenHash),
    errorCode: parsed.errorCode,
  });

  markPasswordRecoveryFlowActive(true);

  if (isPasswordRecoveryErrorUrl(trimmed)) {
    const message = passwordRecoveryInvalidLinkMessage(parsed);
    setPasswordRecoveryError(message);
    passwordRecoveryDeepLinkHandled = true;
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] verifyOtp error =", parsed.errorCode ?? parsed.error);
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (link error)");
    return true;
  }

  if (parsed.tokenHash) {
    if (parsed.type && parsed.type !== "recovery") {
      setPasswordRecoveryError("Ce lien de réinitialisation n'est plus valide.");
      passwordRecoveryDeepLinkHandled = true;
      navigateToResetPasswordRoute();
      console.log("[PASSWORD_RECOVERY] showing reset screen = true (invalid type)");
      return true;
    }

    const outcome = await verifyPasswordRecoveryOtp(parsed.tokenHash);
    if (!outcome.ok) {
      setPasswordRecoveryError(
        outcome.error?.toLowerCase().includes("expired") ||
          outcome.error?.toLowerCase().includes("invalid")
          ? "Ce lien de réinitialisation n'est plus valide."
          : outcome.error ?? "Ce lien de réinitialisation n'est plus valide.",
      );
      passwordRecoveryDeepLinkHandled = true;
      navigateToResetPasswordRoute();
      console.log("[PASSWORD_RECOVERY] showing reset screen = true (verifyOtp failed)");
      return true;
    }

    passwordRecoveryDeepLinkHandled = true;
    setPasswordRecoveryError(null);
    scrubOAuthTokensFromNativeWindow();
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true");
    return true;
  }

  try {
    const outcome = await establishSupabaseSessionFromOAuthCallbackUrl(trimmed);
    if (!outcome.ok) {
      console.warn("[PasswordRecovery] session_failed", { error: outcome.error, method: outcome.method });
      setPasswordRecoveryError("Ce lien de réinitialisation n'est plus valide.");
      passwordRecoveryDeepLinkHandled = true;
      navigateToResetPasswordRoute();
      return true;
    }

    console.log("[PasswordRecovery] session_ok", { method: outcome.method });
    passwordRecoveryDeepLinkHandled = true;
    setPasswordRecoveryError(null);
    scrubOAuthTokensFromNativeWindow();
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true");
    return true;
  } catch (e) {
    console.warn("[PasswordRecovery] unexpected_error", e instanceof Error ? e.message : e);
    setPasswordRecoveryError("Ce lien de réinitialisation n'est plus valide.");
    passwordRecoveryDeepLinkHandled = true;
    navigateToResetPasswordRoute();
    return true;
  }
}
