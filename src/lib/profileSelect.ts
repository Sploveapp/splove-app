/**
 * Colonnes `profiles` : lecture en cascade (du plus riche → noyau stable) pour
 * compatibilité local / Render si certaines migrations ne sont pas appliquées.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_COLUMNS_CORE =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, is_photo_verified, photo_status, needs_adapted_activities, onboarding_sports_count, onboarding_sports_with_level_count, city, latitude, longitude, discovery_radius_km, location_updated_at, sport_time, sport_intensity, meet_vibe, planning_style, sport_motivation, sport_phrase, photo1_status, photo2_status, photo_moderation_overall, is_under_review, moderation_strikes_count";

export const PROFILE_SELECT_CORE = PROFILE_COLUMNS_CORE;

export const PROFILE_SELECT = `${PROFILE_COLUMNS_CORE}, location_source`;

const PROFILE_WITH_LOCATION = `${PROFILE_COLUMNS_CORE}, location_source`;

/** Sans empreinte modération (058 etc.) + `location_source` (057). */
const PROFILE_SELECT_NO_PHOTO_MOD =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, is_photo_verified, photo_status, needs_adapted_activities, onboarding_sports_count, onboarding_sports_with_level_count, city, latitude, longitude, discovery_radius_km, location_updated_at, sport_time, sport_intensity, meet_vibe, planning_style, sport_motivation, sport_phrase, location_source";

const PROFILE_SELECT_MID_LIFE =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity, planning_style, sport_phrase, onboarding_sports_count, onboarding_sports_with_level_count";

const PROFILE_SELECT_CORE_IDENTITY_GEO =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity";

/**
 * Noyau stable typique pour la décision auth / routing.
 */
export const PROFILE_SELECT_GATE =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

const PROFILE_SELECT_GATE_FLAGS_NAMES =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

export const PROFILE_SELECT_MINIMAL =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

const PROFILE_SELECT_MINIMAL_NO_ONBOARDING =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed";

const PROFILE_SELECT_ULTRA =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

const PROFILE_SELECT_ULTRA_FLAGS =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed";

/**
 * Ordre : large → strict. Le premier `select` qui réussit sert d’autoroute ; les échecs
 * 400/42703 sur colonne inconnue passent au palier suivant.
 */
export const PROFILE_LOAD_TIERS_FOR_AUTH: string[] = [
  PROFILE_WITH_LOCATION,
  PROFILE_COLUMNS_CORE,
  PROFILE_SELECT_NO_PHOTO_MOD,
  PROFILE_SELECT_MID_LIFE,
  PROFILE_SELECT_CORE_IDENTITY_GEO,
  PROFILE_SELECT_GATE,
  PROFILE_SELECT_GATE_FLAGS_NAMES,
  PROFILE_SELECT_MINIMAL,
  PROFILE_SELECT_MINIMAL_NO_ONBOARDING,
  PROFILE_SELECT_ULTRA,
  PROFILE_SELECT_ULTRA_FLAGS,
];

const ONBOARDING_HYDRATE_FULL =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, location_source, sport_time, sport_intensity, meet_vibe, planning_style, onboarding_variant, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_PRACTICE_PREFS =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, location_source, sport_time, sport_intensity, meet_vibe, planning_style, sport_motivation, sport_phrase, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_LOC_SOURCE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity, meet_vibe, planning_style, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_MEET_VIBE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity, planning_style, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_COMPACT =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity, planning_style, sport_phrase, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_BASE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_time, sport_intensity, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_MIN =
  "id, first_name, birth_date, gender, looking_for, intent, city, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_TINY =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

/**
 * Reprise draft onboarding : requêtes successives en cas de colonne absente.
 */
export const ONBOARDING_PROFILE_HYDRATE_TIERS: string[] = [
  ONBOARDING_HYDRATE_FULL,
  ONBOARDING_HYDRATE_NO_PRACTICE_PREFS,
  ONBOARDING_HYDRATE_NO_LOC_SOURCE,
  ONBOARDING_HYDRATE_NO_MEET_VIBE,
  ONBOARDING_HYDRATE_COMPACT,
  ONBOARDING_HYDRATE_BASE,
  ONBOARDING_HYDRATE_MIN,
  ONBOARDING_HYDRATE_TINY,
  "id, first_name, birth_date",
];

export const PROFILE_UPSERT_ONBOARDING_SELECT_CORE = PROFILE_COLUMNS_CORE;

export const PROFILE_UPSERT_ONBOARDING_SELECT = `${PROFILE_COLUMNS_CORE}, location_source`;

/** Erreur « colonne absente » (Postgres 42703, ex. colonne `location_source` absente). */
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

/** RLS / permission — on ne tente pas d’autres `select` (ce n’est pas un schéma partiel). */
function isRlsOrPermissionError(
  error: { code?: string | number; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const c = String(error.code ?? "");
  if (c === "42501" || c === "PGRST301") return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("permission denied") ||
    m.includes("row-level security") ||
    m.includes("policy") ||
    m.includes("rls")
  );
}

/**
 * 42703, ou 400 PGRST avec colonne inconnue, ou message classique "column ... does not exist".
 */
export function isRecoverableUnknownColumnError(
  error: { code?: string | number; message?: string; details?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (isPostgresUndefinedColumnError(error)) return true;
  const m = (error.message ?? "").toLowerCase();
  if (/could not find the .* column|column .* does not exist|undefined column/i.test(m)) {
    return true;
  }
  return false;
}

/**
 * Premier `select` de la liste qui réussit. Erreur schéma → palier suivant. RLS → arrêt.
 */
export async function selectProfilesFirstMatch(
  client: SupabaseClient,
  userId: string,
  selectTiers: string[],
  logContext: string,
): Promise<{
  data: Record<string, unknown> | null;
  usedSelect: string | null;
  lastError: { code?: string; message?: string } | null;
}> {
  for (const select of selectTiers) {
    const { data, error } = await client
      .from("profiles")
      .select(select)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isRlsOrPermissionError(error)) {
        console.warn(`[${logContext}] select aborted (rls/permission)`, {
          select: select.slice(0, 80) + (select.length > 80 ? "…" : ""),
          code: error.code,
          message: error.message,
        });
        return { data: null, usedSelect: null, lastError: error };
      }
      if (isRecoverableUnknownColumnError(error)) {
        console.debug(`[${logContext}] select tier skipped (schema/column)`, {
          code: error.code,
          message: error.message,
          selectSample: select.slice(0, 100) + (select.length > 100 ? "…" : ""),
        });
        continue;
      }
      console.warn(`[${logContext}] select failed`, {
        code: error.code,
        message: error.message,
        selectSample: select.slice(0, 100) + (select.length > 100 ? "…" : ""),
      });
      return { data: null, usedSelect: null, lastError: error };
    }
    if (data) {
      console.debug(`[${logContext}] select OK`, {
        usedSelectSample: select.slice(0, 120) + (select.length > 120 ? "…" : ""),
        keys: Object.keys(data as object).length,
      });
      return { data: data as unknown as Record<string, unknown>, usedSelect: select, lastError: null };
    }
  }
  return { data: null, usedSelect: null, lastError: null };
}
