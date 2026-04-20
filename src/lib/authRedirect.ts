/**
 * URLs passées à Supabase (`redirectTo`, recovery, OAuth) doivent refléter l’origine
 * actuelle du navigateur (localhost en dev, domaine Render en prod). Ne pas figer
 * de domaine de déploiement dans le code.
 */
export function authRedirectBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/** Callback OAuth (hash router) — retour utilisateur après Google / Apple. */
export function oauthRedirectUrl(): string {
  return `${authRedirectBase()}#/auth`;
}

/** Lien dans l’email « mot de passe oublié ». */
export function passwordRecoveryRedirectUrl(): string {
  return `${authRedirectBase()}#/reset-password`;
}
