import { isNativeCapacitorApp, NATIVE_PASSWORD_RESET_CALLBACK } from "./authRedirect";
import {
  parsePasswordRecoveryUrl,
  sanitizeRecoveryTokenHash,
} from "./passwordRecoveryVerifyOtp";

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
  const hash = sanitizeRecoveryTokenHash(tokenHash);
  const recoveryType = type.trim();
  if (!hash || recoveryType !== "recovery") {
    throw new Error("Invalid password recovery deep link params");
  }
  const query = `token_hash=${encodeURIComponent(hash)}&type=${encodeURIComponent(recoveryType)}`;
  return `${NATIVE_PASSWORD_RESET_CALLBACK}?${query}`;
}

export function validatePasswordRecoveryDeepLink(deepLink: string): {
  ok: boolean;
  url: string;
  tokenHash: string | null;
  type: string | null;
  reason?: string;
} {
  const trimmed = deepLink.trim();
  if (!trimmed.startsWith(`${NATIVE_PASSWORD_RESET_CALLBACK}?`)) {
    return {
      ok: false,
      url: trimmed,
      tokenHash: null,
      type: null,
      reason: "wrong_prefix",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      url: trimmed,
      tokenHash: null,
      type: null,
      reason: "url_parse_failed",
    };
  }

  const tokenHash = sanitizeRecoveryTokenHash(parsed.searchParams.get("token_hash"));
  const type = parsed.searchParams.get("type")?.trim() ?? null;
  if (!tokenHash) {
    return {
      ok: false,
      url: trimmed,
      tokenHash: null,
      type,
      reason: "missing_token_hash",
    };
  }
  if (type !== "recovery") {
    return {
      ok: false,
      url: trimmed,
      tokenHash,
      type,
      reason: "wrong_type",
    };
  }

  const url = buildNativePasswordRecoveryDeepLink(tokenHash, "recovery");
  return { ok: true, url, tokenHash, type: "recovery" };
}

/** Ouvre l’app SPLove — ne consomme pas le token côté web. */
export function openNativePasswordRecoveryApp(deepLink: string): void {
  const validated = validatePasswordRecoveryDeepLink(deepLink);
  if (!validated.ok) {
    console.error("[PASSWORD_RECOVERY] invalid deep link", {
      reason: validated.reason,
      preview: deepLink.slice(0, 120),
    });
    return;
  }

  console.log("[PASSWORD_RECOVERY] web bridge → native deep link =", validated.url.slice(0, 80));
  console.log("[PASSWORD_RECOVERY] token_hash present =", Boolean(validated.tokenHash));
  console.log("[PASSWORD_RECOVERY] type=recovery =", validated.type === "recovery");
  window.location.assign(validated.url);
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
