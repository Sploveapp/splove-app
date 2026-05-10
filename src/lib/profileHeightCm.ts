/** Aligné contrainte BDD `profiles_height_cm_range_check` (100–250). */
export const PROFILE_HEIGHT_CM_MIN = 100;
export const PROFILE_HEIGHT_CM_MAX = 250;

/** Pour affichage public (Discover, etc.) — null si absent ou hors plage. */
export function formatHeightCmForDisplay(raw: unknown): string | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < PROFILE_HEIGHT_CM_MIN || n > PROFILE_HEIGHT_CM_MAX) return null;
  return `${n} cm`;
}

/** Saisie libre type onboarding / édition profil. */
export function parseHeightCmOptionalInput(input: string): number | null {
  const trimmed = input.replace(/[^0-9]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < PROFILE_HEIGHT_CM_MIN || rounded > PROFILE_HEIGHT_CM_MAX) return null;
  return rounded;
}
