/**
 * Mode bêta testeurs : bypass SPLove+ / paywall côté app uniquement (`VITE_BETA_MODE=true`).
 * Aucune indication UI — activation uniquement au build via `.env`.
 */
export const BETA_MODE =
  import.meta.env.VITE_BETA_MODE === "true" || import.meta.env.VITE_BETA_MODE === "1";
