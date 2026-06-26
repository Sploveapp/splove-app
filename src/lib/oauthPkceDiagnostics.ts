import { Preferences } from "@capacitor/preferences";
import { isNativeCapacitorApp } from "./authRedirect";

const AUTH_STORAGE_KEY = "splove-auth";
const CODE_VERIFIER_KEY = `${AUTH_STORAGE_KEY}-code-verifier`;

export type PkceDiagnosticsPhase =
  | "PKCE_KEYS_BEFORE_EXCHANGE"
  | "PKCE_KEYS_BEFORE_RETRY"
  | "PKCE_KEYS_AFTER_EXCHANGE"
  | "PKCE_KEYS_AFTER_SIGNIN";

/** Présence des clés PKCE (jamais la valeur du verifier). */
export async function logPkceStorageKeys(phase: PkceDiagnosticsPhase): Promise<void> {
  if (!isNativeCapacitorApp()) return;
  try {
    const [auth, verifier] = await Promise.all([
      Preferences.get({ key: AUTH_STORAGE_KEY }),
      Preferences.get({ key: CODE_VERIFIER_KEY }),
    ]);
    console.log(phase, {
      hasAuthSession: Boolean(auth.value),
      hasCodeVerifier: Boolean(verifier.value),
    });
  } catch (e) {
    console.log(phase, { error: e instanceof Error ? e.message : String(e) });
  }
}
