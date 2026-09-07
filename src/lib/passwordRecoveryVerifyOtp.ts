import { supabase } from "./supabase";

export type PasswordRecoveryUrlParams = {
  tokenHash: string | null;
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

function appendSearchParams(target: URLSearchParams, raw: string): void {
  const trimmed = raw.replace(/^[?#]/, "").trim();
  if (!trimmed || !trimmed.includes("=")) return;
  const sp = new URLSearchParams(trimmed);
  sp.forEach((value, key) => {
    target.set(key, value);
  });
}

/** Nettoie token_hash (espaces, retours ligne mail, etc.). */
export function sanitizeRecoveryTokenHash(value: string | null): string | null {
  if (value == null) return null;
  let trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  trimmed = trimmed.replace(/[\r\n\t ]+/g, "");
  if (!trimmed) return null;
  try {
    trimmed = decodeURIComponent(trimmed);
  } catch {
    /* conserve la valeur brute si décodage impossible */
  }
  trimmed = trimmed.replace(/[\r\n\t ]+/g, "");
  return trimmed || null;
}

/** Extrait token_hash, type, error depuis deep link ou URL web recovery. */
export function parsePasswordRecoveryUrl(inputUrl: string): PasswordRecoveryUrlParams {
  const url = inputUrl.trim();
  const merged = new URLSearchParams();

  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");

  if (queryStart !== -1) {
    const end = hashStart !== -1 && hashStart > queryStart ? hashStart : url.length;
    appendSearchParams(merged, url.slice(queryStart + 1, end));
  }

  if (hashStart !== -1) {
    let hashPart = url.slice(hashStart + 1);
    const routePrefix = hashPart.match(
      /^\/?(?:auth\/callback|auth\/recovery|auth\/reset-password|login-callback|reset-password)\/?/i,
    );
    if (routePrefix) {
      hashPart = hashPart.slice(routePrefix[0].length);
    }
    appendSearchParams(merged, hashPart);
  }

  if ([...merged.keys()].length === 0) {
    appendSearchParams(merged, url);
  }

  return {
    tokenHash: sanitizeRecoveryTokenHash(merged.get("token_hash")),
    type: merged.get("type")?.trim() ?? null,
    error: merged.get("error"),
    errorCode: merged.get("error_code"),
    errorDescription: merged.get("error_description"),
  };
}

export function isPasswordRecoveryErrorUrl(url: string): boolean {
  const parsed = parsePasswordRecoveryUrl(url);
  if (!parsed.error && !parsed.errorCode) return false;
  if (parsed.errorCode === "otp_expired") return true;
  if (parsed.error === "access_denied" && parsed.errorCode === "otp_expired") return true;
  return Boolean(parsed.error || parsed.errorCode);
}

/** Message utilisateur pour lien expiré / invalide. */
export function passwordRecoveryInvalidLinkMessage(params?: PasswordRecoveryUrlParams): string {
  if (params?.errorCode === "otp_expired") {
    return "Ce lien de réinitialisation n'est plus valide.";
  }
  if (params?.errorDescription?.trim()) {
    return decodeURIComponent(params.errorDescription.replace(/\+/g, " "));
  }
  return "Ce lien de réinitialisation n'est plus valide.";
}

function tokenHashPreview(tokenHash: string): string {
  return tokenHash.length > 8 ? `${tokenHash.slice(0, 8)}…` : tokenHash;
}

/** Une seule invocation Supabase verifyOtp par token_hash (filet de sécurité). */
const verifyOtpByToken = new Map<
  string,
  Promise<{ ok: boolean; error: string | null }>
>();

/**
 * Vérifie le token_hash côté client — ne consomme pas ConfirmationURL serveur avant l’ouverture app.
 */
export async function verifyPasswordRecoveryOtp(tokenHash: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const normalized = sanitizeRecoveryTokenHash(tokenHash);
  if (!normalized) {
    console.log("[PASSWORD_RECOVERY] verifyOtp error = missing token_hash");
    return { ok: false, error: "missing token_hash" };
  }

  const preview = tokenHashPreview(normalized);
  const existing = verifyOtpByToken.get(normalized);
  if (existing) {
    console.log("[PASSWORD_RECOVERY] verifyOtp deduped — join in-flight", { token: preview });
    return existing;
  }

  const work = (async () => {
    console.log("[PASSWORD_RECOVERY] token_hash detected =", preview);
    console.log("[PASSWORD_RECOVERY] verifyOtp start", { token: preview });

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: normalized,
      type: "recovery",
    });

    if (error) {
      console.log("[PASSWORD_RECOVERY] verifyOtp error =", error.message, {
        token: preview,
        code: error.code ?? null,
        status: error.status ?? null,
      });
      return { ok: false, error: error.message };
    }

    const ok = Boolean(data.session?.user?.id);
    if (ok) {
      console.log("[PASSWORD_RECOVERY] verifyOtp success", {
        token: preview,
        userId: data.session?.user?.id?.slice(0, 8) ?? null,
      });
    } else {
      console.log("[PASSWORD_RECOVERY] verifyOtp error = no session returned", { token: preview });
    }
    return { ok, error: ok ? null : "verifyOtp returned no session" };
  })();

  verifyOtpByToken.set(normalized, work);
  return work;
}
