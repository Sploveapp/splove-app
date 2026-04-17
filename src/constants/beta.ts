/**
 * Mode bêta testeurs : accès SPLove+ gratuit côté app (`VITE_BETA_MODE=true` ou `1`).
 * Voir `usePremium` / `hasPremiumAccess` et bannière sur `/splove-plus`.
 */
export const BETA_MODE =
  import.meta.env.VITE_BETA_MODE === "true" || import.meta.env.VITE_BETA_MODE === "1";
