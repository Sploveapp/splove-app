/**
 * Colonnes `profiles` : lecture en cascade (du plus riche → noyau stable) pour
 * compatibilité local / Render si certaines migrations ne sont pas appliquées.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Noyau auth / routing : sans colonnes optionnelles parfois absentes (accessibilité, créneau). */
const PROFILE_COLUMNS_CORE =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, onboarding_done, is_photo_verified, photo_status, onboarding_sports_count, onboarding_sports_with_level_count, city, latitude, longitude, discovery_radius_km, location_updated_at, sport_intensity, meet_vibe, sport_motivation, sport_phrase, photo1_status, photo2_status, photo_moderation_overall, is_under_review, moderation_strikes_count";

export const PROFILE_SELECT_CORE = PROFILE_COLUMNS_CORE;

export const PROFILE_SELECT = `${PROFILE_COLUMNS_CORE}, location_source`;

const PROFILE_WITH_LOCATION = `${PROFILE_COLUMNS_CORE}, location_source`;

/** Sans empreinte modération (058 etc.) + `location_source` (057). */
const PROFILE_SELECT_NO_PHOTO_MOD =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, is_photo_verified, photo_status, onboarding_sports_count, onboarding_sports_with_level_count, city, latitude, longitude, discovery_radius_km, location_updated_at, sport_intensity, meet_vibe, sport_motivation, sport_phrase, location_source";

const PROFILE_SELECT_MID_LIFE =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, city, latitude, longitude, discovery_radius_km, sport_intensity, sport_phrase, onboarding_sports_count, onboarding_sports_with_level_count";

const PROFILE_SELECT_CORE_IDENTITY_GEO =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed, city, latitude, longitude, discovery_radius_km, sport_intensity";

/**
 * Noyau stable typique pour la décision auth / routing.
 */
export const PROFILE_SELECT_GATE =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

const PROFILE_SELECT_GATE_FLAGS_NAMES =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

export const PROFILE_SELECT_MINIMAL =
  "id, first_name, birth_date, gender, looking_for, intent, meet_pref, accepted_terms_at, accepted_privacy_at, portrait_url, fullbody_url, main_photo_url, profile_completed, onboarding_completed";

/** Post-OAuth : routing + geo Discover + photos (évite profil sans URLs sur iOS). */
export const PROFILE_SELECT_OAUTH_DISCOVER_GATE =
  "id, first_name, birth_date, gender, looking_for, profile_completed, onboarding_completed, onboarding_done, portrait_url, fullbody_url, main_photo_url, avatar_url, city, latitude, longitude, discovery_radius_km, sport_match_preference";

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

/** Post-login OAuth : paliers sans colonnes optionnelles d’abord (évite 42703 lents). */
export const PROFILE_LOAD_TIERS_FAST_AUTH: string[] = [
  PROFILE_SELECT_ULTRA_FLAGS,
  PROFILE_SELECT_GATE_FLAGS_NAMES,
  PROFILE_SELECT_OAUTH_DISCOVER_GATE,
];

/** Timeout fetch profil fast (background, non bloquant UI). */
export const PROFILE_FETCH_FAST_MS = 2_000;

/** Profil minimal pour afficher le shell Discover (pas d’enrichissement optionnel). */
export function isProfileMinimalForDiscoverGate(
  profile: { id?: string; first_name?: unknown; birth_date?: unknown; gender?: unknown; looking_for?: unknown; profile_completed?: unknown } | null | undefined,
): boolean {
  if (!profile?.id) return false;
  return (
    "first_name" in profile &&
    "birth_date" in profile &&
    "gender" in profile &&
    "looking_for" in profile &&
    "profile_completed" in profile
  );
}

/** Timeout max bootstrap post-login (AuthContext + Discover feed). */
export const POST_LOGIN_BOOT_MAX_MS = 2_000;

/** Max wait auth bootstrap (iOS) — plafond 2 s. */
export const AUTH_BOOTSTRAP_MAX_MS = POST_LOGIN_BOOT_MAX_MS;

/** Max wait for profile fetch before unblocking app bootstrap (OAuth / post-login). */
export const AUTH_PROFILE_BOOTSTRAP_MAX_MS = POST_LOGIN_BOOT_MAX_MS;

/** Tentatives max (réseau) pour fetch profil auth. */
export const AUTH_PROFILE_FETCH_MAX_ATTEMPTS = 2;

/** Durée max écran OAuth (AuthCallback) — conservé pour référence, plus de redirect forcé. */
export const OAUTH_SPLASH_MAX_MS = 1_500;

/**
 * Discover peut s’afficher : profil terminé ou noyau minimal — les colonnes optionnelles
 * absentes (language, adapted openness, etc.) ne doivent jamais bloquer le rendu.
 */
export function canShowDiscoverShell(
  profile: {
    id?: string;
    profile_completed?: unknown;
    onboarding_completed?: unknown;
    onboarding_done?: unknown;
    first_name?: unknown;
    birth_date?: unknown;
    gender?: unknown;
    looking_for?: unknown;
  } | null | undefined,
): boolean {
  if (!profile?.id) return false;
  if (profile.profile_completed === true) return true;
  const row = profile as Record<string, unknown>;
  if (row.onboarding_completed === true || row.onboarding_done === true) return true;
  return isProfileMinimalForDiscoverGate(profile);
}

/** Délai max pour décider /move vs /onboarding après OAuth (non bloquant feed). */
export const OAUTH_ROUTE_RESOLVE_MS = 500;

export function isProfileCompleteForMove(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.profile_completed === true) return true;
  if (profile.onboarding_completed === true) return true;
  if (profile.onboarding_done === true) return true;
  return false;
}

/** Route post-OAuth : /move si profil terminé, sinon /onboarding (attend le profil). */
export async function resolvePostOAuthPath(
  client: SupabaseClient,
  userId: string,
): Promise<"/move" | "/onboarding"> {
  const result = await selectProfilesFirstMatch(
    client,
    userId,
    PROFILE_LOAD_TIERS_FAST_AUTH,
    "[oauth-route]",
  );
  const row = (result.data as Record<string, unknown> | null) ?? null;
  if (!row) {
    console.warn("[BOOT] resolvePostOAuthPath — profil absent, onboarding par défaut");
    return "/onboarding";
  }
  return isProfileCompleteForMove(row) ? "/move" : "/onboarding";
}

const OPTIONAL_COLS_SKIP_STORAGE_KEY = "splove_profile_optional_cols_skip_v1";

function readSkippedOptionalCols(): Set<string> {
  try {
    const raw = sessionStorage.getItem(OPTIONAL_COLS_SKIP_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function rememberSkippedOptionalCol(column: string): void {
  const set = readSkippedOptionalCols();
  if (set.has(column)) return;
  set.add(column);
  try {
    sessionStorage.setItem(OPTIONAL_COLS_SKIP_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

const ADAPTED_OPENNESS_SKIP_KEY = "splove_profile_adapted_openness_skip_v1";

/** Évite les doubles SELECT open_to_adapted / pref_open_to_adapted si absents en prod. */
export function shouldSkipAdaptedOpennessFetch(): boolean {
  try {
    return sessionStorage.getItem(ADAPTED_OPENNESS_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAdaptedOpennessFetchSkipped(): void {
  try {
    sessionStorage.setItem(ADAPTED_OPENNESS_SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Évite les SELECT optionnels bloquants au cold start post-OAuth (colonnes souvent absentes en prod). */
export function seedPostLoginOptionalColSkips(): void {
  for (const col of OPTIONAL_PROFILE_FIELDS) {
    rememberSkippedOptionalCol(col);
  }
  markAdaptedOpennessFetchSkipped();
}

export function shouldSkipAllOptionalProfileFields(): boolean {
  const skipped = readSkippedOptionalCols();
  return OPTIONAL_PROFILE_FIELDS.every((c) => skipped.has(c));
}

const ONBOARDING_HYDRATE_FULL =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, location_source, sport_intensity, meet_vibe, onboarding_variant, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

/** Même jeu de colonnes qu’avant `094_profiles_open_to_adapted_activities` (colonnes absentes en prod). */
const ONBOARDING_HYDRATE_PRE_ADAPTED_OPENNESS =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, location_source, sport_intensity, meet_vibe, onboarding_variant, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_PRACTICE_PREFS =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, location_source, sport_intensity, meet_vibe, sport_motivation, sport_phrase, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_LOC_SOURCE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_intensity, meet_vibe, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_NO_MEET_VIBE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_intensity, sport_motivation, sport_phrase, practice_preferences, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_COMPACT =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_intensity, sport_phrase, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_BASE =
  "id, first_name, birth_date, gender, looking_for, intent, city, latitude, longitude, discovery_radius_km, sport_intensity, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_MIN =
  "id, first_name, birth_date, gender, looking_for, intent, city, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

const ONBOARDING_HYDRATE_TINY =
  "id, first_name, birth_date, gender, looking_for, intent, portrait_url, fullbody_url, main_photo_url, avatar_url, photo2_path, portrait_path, fullbody_path, activity_photo_path";

/**
 * Reprise draft onboarding : requêtes successives en cas de colonne absente.
 */
export const ONBOARDING_PROFILE_HYDRATE_TIERS: string[] = [
  ONBOARDING_HYDRATE_FULL,
  ONBOARDING_HYDRATE_PRE_ADAPTED_OPENNESS,
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
  error: { code?: string | number; message?: string; details?: string; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (isPostgresUndefinedColumnError(error)) return true;
  const c = String(error.code ?? "");
  // PostgREST : colonne absente / cache schéma (codes variables selon version).
  if (c === "PGRST204") return true;
  const m = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (/could not find the .* column|column .* does not exist|undefined column/i.test(m)) {
    return true;
  }
  if (m.includes("schema cache") && /column|field/.test(m)) return true;
  return false;
}

/**
 * Colonnes `profiles` absentes sur certains schémas prod : chargées uniquement via
 * `mergeOptionalProfileFields` (repli silencieux si colonne / cache / PGRST204).
 */
export const OPTIONAL_PROFILE_FIELDS = [
  "preferred_age_min",
  "preferred_age_max",
  "sport_match_preference",
  "needs_adapted_activities",
  "sport_time",
  "boost_credits",
  "beta_splove_plus_unlocked",
  /** Identité (Veriff ou équivalent) — badge « Profil vérifié » uniquement avec ces flags. */
  "identity_verified",
  "veriff_status",
  /** Préférence de langue d’interface (sync onboarding / localStorage `splove_language`). */
  "language",
] as const;

/**
 * Sélection optionnelle après un noyau `profiles` réussi : ne jette jamais ;
 * retire les colonnes manquantes jusqu’à liste vide.
 */
export async function mergeOptionalProfileFields(
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  if (shouldSkipAllOptionalProfileFields()) {
    return {};
  }
  const skipped = readSkippedOptionalCols();
  let cols = OPTIONAL_PROFILE_FIELDS.filter((c) => !skipped.has(c));
  if (cols.length === 0) return {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (cols.length === 0) return {};
    const { data, error } = await client
      .from("profiles")
      .select(cols.join(", "))
      .eq("id", userId)
      .maybeSingle();
    if (!error && data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    if (!error) return {};
    if (isRecoverableUnknownColumnError(error)) {
      const msg = error.message ?? "";
      const m =
        msg.match(/column\s+profiles\.["']?([a-zA-Z0-9_]+)["']?/i) ??
        msg.match(/column\s+["']?([a-zA-Z0-9_]+)["']?/i);
      const miss = m?.[1] ?? null;
      if (import.meta.env.DEV && attempt === 0) {
        console.debug("[PROFILE_OPTIONAL_FIELDS_SKIPPED]", {
          reason: "missing_column_retry",
          column: miss,
          message: msg.slice(0, 120),
        });
      }
      if (miss && cols.some((x) => x === miss)) {
        rememberSkippedOptionalCol(miss);
        cols = cols.filter((x) => x !== miss);
      } else {
        cols = cols.slice(0, -1);
      }
      continue;
    }
    if (import.meta.env.DEV) {
      console.log("[PROFILE_OPTIONAL_FIELDS_SKIPPED]", {
        reason: "terminal_error",
        code: error.code,
        message: error.message ?? null,
      });
    }
    return {};
  }
  return {};
}

/** @deprecated Utiliser mergeOptionalProfileFields — alias compat. */
export const tryMergeOptionalAuthProfileFields = mergeOptionalProfileFields;

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
