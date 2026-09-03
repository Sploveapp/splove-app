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
    tokenHash: merged.get("token_hash"),
    type: merged.get("type"),
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

/**
 * Vérifie le token_hash côté client — ne consomme pas ConfirmationURL serveur avant l’ouverture app.
 */
export async function verifyPasswordRecoveryOtp(tokenHash: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const preview = tokenHash.length > 8 ? `${tokenHash.slice(0, 8)}…` : tokenHash;
  console.log("[PASSWORD_RECOVERY] incoming token hash =", preview);
  console.log("[PASSWORD_RECOVERY] verifyOtp start");

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error) {
    console.log("[PASSWORD_RECOVERY] verifyOtp error =", error.message, {
      code: error.code ?? null,
    });
    return { ok: false, error: error.message };
  }

  const ok = Boolean(data.session?.user?.id);
  if (ok) {
    console.log("[PASSWORD_RECOVERY] verifyOtp success", { userId: data.session?.user?.id });
  } else {
    console.log("[PASSWORD_RECOVERY] verifyOtp error = no session returned");
  }
  return { ok, error: ok ? null : "verifyOtp returned no session" };
}
