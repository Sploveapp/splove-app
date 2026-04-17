/**
 * Colonnes `profiles` lues par AuthContext (`fetchProfile`).
 * `location_source` : migration `057_profile_location_source_and_discover_distance_rpc.sql`.
 */
const PROFILE_COLUMNS_CORE =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, is_photo_verified, photo_status, needs_adapted_activities, onboarding_sports_count, onboarding_sports_with_level_count, city, latitude, longitude, discovery_radius_km, location_updated_at, sport_time, sport_motivation, sport_phrase, photo1_status, photo2_status, photo_moderation_overall, is_under_review, moderation_strikes_count";

/** Sans `location_source` — si la migration 057 n’est pas appliquée (PostgreSQL 42703). */
export const PROFILE_SELECT_CORE = PROFILE_COLUMNS_CORE;

export const PROFILE_SELECT = `${PROFILE_COLUMNS_CORE}, location_source`;

/** Dernier recours AuthContext si 42703 sur le core (aucune colonne optionnelle / métier). */
export const PROFILE_SELECT_MINIMAL = "id, first_name";

/** Retour upsert onboarding : aligné sur les colonnes lues (avec `location_source` si présent en base). */
export const PROFILE_UPSERT_ONBOARDING_SELECT_CORE = PROFILE_COLUMNS_CORE;

export const PROFILE_UPSERT_ONBOARDING_SELECT = `${PROFILE_COLUMNS_CORE}, location_source`;

/** Erreur « colonne absente » (Postgres 42703, ex. `column profiles.location_source does not exist`). */
export function isUndefinedColumnError(
  error: { code?: string | number; message?: string } | null | undefined,
  columnName: string,
): boolean {
  const c = error?.code;
  if (c !== "42703" && c !== 42703) return false;
  return new RegExp(`\\b${columnName}\\b`, "i").test(error?.message ?? "");
}

export function isPostgresUndefinedColumnError(
  error: { code?: string | number; message?: string } | null | undefined,
): boolean {
  const c = error?.code;
  return c === "42703" || c === 42703;
}
