/**
 * Détection centralisée des URLs « techniques » OAuth (infrastructure Supabase / tokens).
 *
 * Règle produit :
 * - accounts.google.com → visible, normal → jamais intercepté ici
 * - *.supabase.co / callback / tokens → fermer le navigateur intégré immédiatement
 * - splove://auth/callback → deep link app, routé séparément (pas intercepté ici)
 */

/** Fournisseur Google — l’utilisateur peut voir cette page pendant le login. */
export function isGoogleOAuthProviderUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const lower = url.trim().toLowerCase();
  return (
    lower.includes("accounts.google.com") ||
    lower.includes("google.com/o/oauth2") ||
    lower.includes("googleusercontent.com")
  );
}

/**
 * URL technique OAuth : le navigateur Capacitor / ASWebAuth ne doit pas la laisser visible
 * après la validation Google (fermeture immédiate, overlay SPLove uniquement).
 */
export function isOAuthTechnicalUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;

  const trimmed = url.trim();

  if (isGoogleOAuthProviderUrl(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "splove:") return false;
  } catch {
    /* URL relative ou mal formée — on applique les heuristiques ci-dessous */
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("supabase.co")) return true;
  if (lower.includes("/auth/v1/callback")) return true;
  if (lower.includes("access_token")) return true;
  if (lower.includes("refresh_token")) return true;
  if (lower.includes("code=")) return true;
  return false;
}

/** @deprecated Utiliser `isOAuthTechnicalUrl` — alias conservé pour compat interne. */
export function isSupabaseOAuthInterceptUrl(url: string | null | undefined): boolean {
  return isOAuthTechnicalUrl(url);
}
