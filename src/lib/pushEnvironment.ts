/**
 * Environnement push (DEV / STAGING / PRODUCTION).
 * Doit correspondre à SPLove_PUSH_ENV côté Edge Function et push_webhook_settings.push_environment.
 */
export type PushEnvironment = "development" | "staging" | "production";

const PRODUCTION_ALIASES = new Set(["production", "prod"]);
const STAGING_ALIASES = new Set(["staging", "stage", "preview"]);

/** Résout l'environnement push du build client. */
export function resolvePushEnvironment(): PushEnvironment {
  const explicit = import.meta.env.VITE_PUSH_ENV?.trim().toLowerCase();
  if (explicit && PRODUCTION_ALIASES.has(explicit)) return "production";
  if (explicit && STAGING_ALIASES.has(explicit)) return "staging";
  if (explicit === "development" || explicit === "dev" || explicit === "local") return "development";

  const appEnv = (import.meta.env.VITE_APP_ENV ?? "local").trim().toLowerCase();
  if (PRODUCTION_ALIASES.has(appEnv)) return "production";
  if (STAGING_ALIASES.has(appEnv)) return "staging";
  return "development";
}

export function isProductionPushBuild(): boolean {
  return resolvePushEnvironment() === "production";
}

/**
 * Les builds development n'enregistrent pas de token push sauf opt-in explicite
 * (évite qu'un build Xcode / Vite local écrase le token prod d'un utilisateur réel).
 */
export function isPushRegistrationAllowed(): boolean {
  const env = resolvePushEnvironment();
  if (env === "development") {
    return String(import.meta.env.VITE_PUSH_REGISTRATION_IN_DEV ?? "false").trim().toLowerCase() === "true";
  }
  return true;
}
