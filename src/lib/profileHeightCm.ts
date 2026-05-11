/** Aligné contrainte BDD `profiles_height_cm_range_check` (100–250). */
export const PROFILE_HEIGHT_CM_MIN = 100;
export const PROFILE_HEIGHT_CM_MAX = 250;

/** Valeur numérique exploitable pour UI / merge (PostgREST peut renvoyer string). */
export function coerceProfileHeightCm(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n < PROFILE_HEIGHT_CM_MIN || n > PROFILE_HEIGHT_CM_MAX) return null;
    return n;
  }
  if (typeof raw === "string") {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) return null;
    const n = Math.round(Number(digits));
    if (!Number.isFinite(n) || n < PROFILE_HEIGHT_CM_MIN || n > PROFILE_HEIGHT_CM_MAX) return null;
    return n;
  }
  return null;
}

/** Pour affichage public (Discover, etc.) — null si absent ou hors plage. */
export function formatHeightCmForDisplay(raw: unknown): string | null {
  const n = coerceProfileHeightCm(raw);
  if (n == null) return null;
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
