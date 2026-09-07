import {
  isNativeCapacitorApp,
  isNativeOAuthCallbackUrl,
  isNativePasswordRecoveryUrl,
  isNativePasswordResetUrl,
} from "./authRedirect";
import {
  establishSupabaseSessionFromOAuthCallbackUrl,
  parseOAuthCallbackParams,
} from "./oauthCallbackParams";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import {
  isPasswordRecoveryErrorUrl,
  parsePasswordRecoveryUrl,
  passwordRecoveryInvalidLinkMessage,
  sanitizeRecoveryTokenHash,
  verifyPasswordRecoveryOtp,
} from "./passwordRecoveryVerifyOtp";

/** Deep link récupération mot de passe en cours — évite routage OAuth / onboarding. */
let passwordRecoveryFlowActive = false;
let passwordRecoveryError: string | null = null;
let passwordRecoveryDeepLinkHandled = false;
/** token_hash déjà validé par verifyOtp durant cette session app. */
let verifiedRecoveryTokenHash: string | null = null;
/** Promesses en cours par token_hash — empêche double verifyOtp concurrent. */
const recoveryHandlerByToken = new Map<string, Promise<boolean>>();
const passwordRecoveryFlowListeners = new Set<() => void>();

function tokenHashPreview(tokenHash: string): string {
  return tokenHash.length > 8 ? `${tokenHash.slice(0, 8)}…` : tokenHash;
}

function replayVerifiedRecovery(tokenHash: string): boolean {
  markPasswordRecoveryFlowActive(true);
  setPasswordRecoveryError(null);
  passwordRecoveryDeepLinkHandled = true;
  navigateToResetPasswordRoute();
  console.log("[PASSWORD_RECOVERY] verifyOtp skipped — token already verified", {
    token: tokenHashPreview(tokenHash),
  });
  return true;
}

function notifyPasswordRecoveryFlowListeners(): void {
  for (const listener of passwordRecoveryFlowListeners) {
    listener();
  }
}

export function subscribePasswordRecoveryFlow(listener: () => void): () => void {
  passwordRecoveryFlowListeners.add(listener);
  return () => {
    passwordRecoveryFlowListeners.delete(listener);
  };
}

export function getPasswordRecoveryFlowSnapshot(): boolean {
  return passwordRecoveryFlowActive;
}

export function isPasswordRecoveryFlowActive(): boolean {
  return passwordRecoveryFlowActive;
}

export function markPasswordRecoveryFlowActive(active: boolean): void {
  const changed = passwordRecoveryFlowActive !== active;
  passwordRecoveryFlowActive = active;
  if (!active) {
    passwordRecoveryError = null;
  }
  if (changed || active) {
    notifyPasswordRecoveryFlowListeners();
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
  notifyPasswordRecoveryFlowListeners();
  const hashTarget = "#/reset-password";
  if (window.location.hash !== hashTarget) {
    window.location.hash = hashTarget;
  }
  window.dispatchEvent(new CustomEvent("splove:password-recovery:navigate"));
}

/** Navigation reset — utilisable hors React (appUrlOpen, retour foreground). */
export function ensurePasswordRecoveryNavigation(): void {
  navigateToResetPasswordRoute();
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
    const authType = parsePasswordRecoveryUrl(trimmed).type;
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
 * Idempotent par token_hash : un seul verifyOtp même si plusieurs appUrlOpen.
 */
export async function handlePasswordRecoveryDeepLink(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (
    !isPasswordRecoveryDeepLinkActionable(trimmed, { nativeOAuthProviderActive: false }) &&
    !isPasswordRecoveryErrorUrl(trimmed)
  ) {
    return false;
  }

  const parsed = parsePasswordRecoveryUrl(trimmed);
  const tokenHash = parsed.tokenHash ? sanitizeRecoveryTokenHash(parsed.tokenHash) : null;

  if (tokenHash && verifiedRecoveryTokenHash === tokenHash) {
    return replayVerifiedRecovery(tokenHash);
  }

  if (tokenHash) {
    const inFlight = recoveryHandlerByToken.get(tokenHash);
    if (inFlight) {
      console.log("[PASSWORD_RECOVERY] handle deduped — join in-flight verifyOtp", {
        token: tokenHashPreview(tokenHash),
      });
      return inFlight;
    }
  }

  if (passwordRecoveryDeepLinkHandled && isPasswordRecoveryFlowActive() && !tokenHash) {
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (already handled)");
    return true;
  }

  const work = executePasswordRecoveryDeepLink(trimmed, parsed, tokenHash);
  if (tokenHash) {
    recoveryHandlerByToken.set(tokenHash, work);
    console.log("[PASSWORD_RECOVERY] verifyOtp scheduled — single handler", {
      token: tokenHashPreview(tokenHash),
    });
  }
  return work;
}

async function executePasswordRecoveryDeepLink(
  trimmed: string,
  parsed: ReturnType<typeof parsePasswordRecoveryUrl>,
  tokenHash: string | null,
): Promise<boolean> {
  console.log("[PASSWORD_RECOVERY] deep link received", {
    urlLength: trimmed.length,
    hasTokenHash: Boolean(tokenHash),
    errorCode: parsed.errorCode,
    token: tokenHash ? tokenHashPreview(tokenHash) : null,
  });

  markPasswordRecoveryFlowActive(true);
  navigateToResetPasswordRoute();
  console.log("[PASSWORD_RECOVERY] showing reset screen = true (deep link received)");

  if (isPasswordRecoveryErrorUrl(trimmed)) {
    const message = passwordRecoveryInvalidLinkMessage(parsed);
    setPasswordRecoveryError(message);
    passwordRecoveryDeepLinkHandled = true;
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] verifyOtp error =", parsed.errorCode ?? parsed.error);
    console.log("[PASSWORD_RECOVERY] showing reset screen = true (link error)");
    return true;
  }

  if (tokenHash) {
    if (parsed.type && parsed.type !== "recovery") {
      setPasswordRecoveryError("Ce lien de réinitialisation n'est plus valide.");
      passwordRecoveryDeepLinkHandled = true;
      navigateToResetPasswordRoute();
      console.log("[PASSWORD_RECOVERY] showing reset screen = true (invalid type)");
      return true;
    }

    if (verifiedRecoveryTokenHash === tokenHash) {
      return replayVerifiedRecovery(tokenHash);
    }

    const outcome = await verifyPasswordRecoveryOtp(tokenHash);
    if (!outcome.ok) {
      // Ne pas écraser un succès obtenu entre-temps par un handler dédupliqué.
      if (verifiedRecoveryTokenHash === tokenHash) {
        return replayVerifiedRecovery(tokenHash);
      }
      setPasswordRecoveryError(
        outcome.error?.toLowerCase().includes("expired") ||
          outcome.error?.toLowerCase().includes("invalid")
          ? "Ce lien de réinitialisation n'est plus valide."
          : outcome.error ?? "Ce lien de réinitialisation n'est plus valide.",
      );
      passwordRecoveryDeepLinkHandled = true;
      navigateToResetPasswordRoute();
      console.log("[PASSWORD_RECOVERY] showing reset screen = true (verifyOtp failed)", {
        token: tokenHashPreview(tokenHash),
      });
      return true;
    }

    verifiedRecoveryTokenHash = tokenHash;
    passwordRecoveryDeepLinkHandled = true;
    setPasswordRecoveryError(null);
    scrubOAuthTokensFromNativeWindow();
    navigateToResetPasswordRoute();
    console.log("[PASSWORD_RECOVERY] showing reset screen = true", {
      token: tokenHashPreview(tokenHash),
    });
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
