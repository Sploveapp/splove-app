/**
 * Âge affiché / Discover — calcul anniversaires + préférences d'âge réciproques.
 */

export const PROFILE_MIN_VISIBLE_AGE = 18 as const;
export const DEFAULT_PREFERRED_AGE_MIN = 18 as const;
export const DEFAULT_PREFERRED_AGE_MAX = 85 as const;

export type AgePreferenceFields = {
  birth_date?: string | null | undefined;
  preferred_age_min?: number | string | null | undefined;
  preferred_age_max?: number | string | null | undefined;
};

/** Pour champs `profiles` lus via `Record<string, unknown>`. */
export function asAgePreferenceScalar(raw: unknown): number | string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

/** Âge légal SPLove (< 18 exclues partout où on connaît la date). */
export function ageYearsFromBirthDate(
  isoBirth: string | null | undefined,
  ref: Date = new Date(),
): number | null {
  if (isoBirth == null || typeof isoBirth !== "string") return null;
  const raw = isoBirth.trim();
  if (!raw) return null;
  const born = new Date(raw);
  if (!Number.isFinite(born.getTime())) return null;
  let age = ref.getFullYear() - born.getFullYear();
  const m = ref.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < born.getDate())) age -= 1;
  return age;
}

export function coercePreferredAgeMin(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.round(raw)
      : typeof raw === "string"
        ? Math.round(Number.parseFloat(raw))
        : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_PREFERRED_AGE_MIN;
  return Math.min(130, Math.max(PROFILE_MIN_VISIBLE_AGE, n));
}

export function coercePreferredAgeMax(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.round(raw)
      : typeof raw === "string"
        ? Math.round(Number.parseFloat(raw))
        : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_PREFERRED_AGE_MAX;
  return Math.min(130, Math.max(PROFILE_MIN_VISIBLE_AGE, n));
}

/**
 * Tranche utilisée au matching : garantit min <= max et âge légal minimal.
 */
export function normalizePreferredAgeRange(
  preferredMinRaw: unknown,
  preferredMaxRaw: unknown,
): { min: number; max: number } {
  let mn = coercePreferredAgeMin(preferredMinRaw);
  let mx = coercePreferredAgeMax(preferredMaxRaw);
  if (mn > mx) {
    const t = mn;
    mn = mx;
    mx = t;
  }
  return { min: mn, max: mx };
}

/** true si compatibilité d'âge réciproque + jamais d'affichage &lt; 18 lorsque l'âge est connu. */
export function isReciprocalAgeDiscoverMatch(
  viewer: AgePreferenceFields,
  candidate: AgePreferenceFields,
  ref: Date = new Date(),
): boolean {
  const vAge = ageYearsFromBirthDate(viewer.birth_date ?? null, ref);
  const cAge = ageYearsFromBirthDate(candidate.birth_date ?? null, ref);
  if (vAge === null || cAge === null) return false;
  if (vAge < PROFILE_MIN_VISIBLE_AGE || cAge < PROFILE_MIN_VISIBLE_AGE) return false;

  const vPrefs = normalizePreferredAgeRange(viewer.preferred_age_min, viewer.preferred_age_max);
  const cPrefs = normalizePreferredAgeRange(candidate.preferred_age_min, candidate.preferred_age_max);

  const candInMine = cAge >= vPrefs.min && cAge <= vPrefs.max;
  const meInTheirs = vAge >= cPrefs.min && vAge <= cPrefs.max;
  return candInMine && meInTheirs;
}
