/**
 * Feature flags SPLove Play — monétisation (aucun paiement branché).
 * - ENABLE_SPLOVE_PLUS : Play inclus dans SPLove+ actif
 * - ENABLE_PLAY_PACK : achat unique Pack Play (entitlement `play_pack`)
 */
export const ENABLE_SPLOVE_PLUS =
  import.meta.env.VITE_ENABLE_SPLOVE_PLUS === "true" ||
  import.meta.env.VITE_ENABLE_SPLOVE_PLUS === "1";

export const ENABLE_PLAY_PACK =
  import.meta.env.VITE_ENABLE_PLAY_PACK === "true" ||
  import.meta.env.VITE_ENABLE_PLAY_PACK === "1";

/** Au moins un mode monétisation activé côté build. */
export function isSplovePlayMonetizationEnabled(): boolean {
  return ENABLE_SPLOVE_PLUS || ENABLE_PLAY_PACK;
}
