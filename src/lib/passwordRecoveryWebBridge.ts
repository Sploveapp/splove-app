import { isNativeCapacitorApp, NATIVE_PASSWORD_RESET_CALLBACK } from "./authRedirect";
import { parsePasswordRecoveryUrl } from "./passwordRecoveryVerifyOtp";

/**
 * True sur Safari/web : /reset-password?token_hash=…&type=recovery
 * Le token ne doit PAS être consommé ici — redirection vers splove:// uniquement.
 */
export function isWebPasswordRecoveryBridgePage(url?: string): boolean {
  if (typeof window === "undefined" && !url) return false;
  if (!url && isNativeCapacitorApp()) return false;

  let pathname: string;
  try {
    const parsed = new URL(url ?? window.location.href);
    pathname = parsed.pathname;
  } catch {
    return false;
  }

  if (!/\/reset-password\/?$/i.test(pathname)) return false;

  const params = parsePasswordRecoveryUrl(url ?? window.location.href);
  return Boolean(params.tokenHash && params.type === "recovery");
}

/** Deep link natif transmettant le token_hash intact à verifyOtp. */
export function buildNativePasswordRecoveryDeepLink(
  tokenHash: string,
  type = "recovery",
): string {
  const q = new URLSearchParams({ token_hash: tokenHash, type });
  return `${NATIVE_PASSWORD_RESET_CALLBACK}?${q.toString()}`;
}

/** Ouvre l’app SPLove — ne consomme pas le token côté web. */
export function openNativePasswordRecoveryApp(deepLink: string): void {
  console.log("[PASSWORD_RECOVERY] web bridge → native deep link =", deepLink.slice(0, 80));
  window.location.href = deepLink;
}

export function readWebBridgeRecoveryParams(url?: string): {
  tokenHash: string | null;
  type: string | null;
  deepLink: string | null;
} {
  const params = parsePasswordRecoveryUrl(url ?? window.location.href);
  const deepLink =
    params.tokenHash && params.type
      ? buildNativePasswordRecoveryDeepLink(params.tokenHash, params.type)
      : null;
  return {
    tokenHash: params.tokenHash,
    type: params.type,
    deepLink,
  };
}
