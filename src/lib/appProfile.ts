/**
 * Profil minimal issu de `public.profiles` (lecture Supabase / garde de type).
 * Les champs optionnels couvrent les colonnes effectivement utilisées par l’auth et l’onboarding.
 */
export type AppProfile = {
  id: string;
  profile_completed: boolean;
  birth_date?: string | null;
  first_name?: string | null;
  city?: string | null;
  /** Présent sur certaines payloads métier ; pas toujours une colonne `profiles`. */
  location_label?: string | null;
  location_source?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Distinct d’une erreur PostgREST (`GenericStringError`), d’une chaîne ou de null.
 */
export function isProfileRecord(value: unknown): value is AppProfile {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  const pc = value.profile_completed;
  if (typeof pc !== "boolean") return false;
  return true;
}
