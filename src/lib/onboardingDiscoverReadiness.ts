import { isValidDiscoveryRadiusKm } from "../constants/discoverGeo";
import { hasValidSportPracticeLevel } from "./sportPracticeLevel";

/**
 * Contrat UX (référence produit, hors SQL) — champs typiquement exigés avant Discover / Move :
 * prénom, majorité 18+, genre, taille, ville + coordonnées, rayon, tranche d’âge souhaitée (18–85),
 * 1–3 sports avec niveau, « tu souhaites rencontrer », intention (« que cherches-tu »),
 * au moins les photos requises par le flux (portrait + corps), acceptation CGU + confidentialité.
 * Champs souvent facultatifs : bio / phrase sport, niveaux détaillés, préférence sport matching (même logique métier que l’étape 6).
 *
 * La fonction ci-dessous reflète la garde technique actuelle (flags + audit) — ne pas confondre avec le pourcentage décoratif `computeOnboardingProfileFillPercent`.
 */

function hasPortraitOrMainPhoto(row: Record<string, unknown>): boolean {
  const rawP = row.portrait_url;
  const rawM = row.main_photo_url;
  const p = typeof rawP === "string" ? rawP.trim() : "";
  const m = typeof rawM === "string" ? rawM.trim() : "";
  return Boolean(p.length > 0 || m.length > 0);
}

function hasFullbodyPhoto(row: Record<string, unknown>): boolean {
  const raw = row.fullbody_url;
  const f = typeof raw === "string" ? raw.trim() : "";
  return f.length > 0;
}

function isFiniteCoordinate(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return false;
    const n = Number(t);
    return Number.isFinite(n);
  }
  return false;
}

const FIELD_TO_STEP: Record<string, number> = {
  first_name: 1,
  birth_date: 1,
  gender: 2,
  looking_for: 7,
  city: 4,
  latitude: 4,
  longitude: 4,
  discovery_radius_km: 4,
  sport_match_preference: 6,
  profile_sports_rows: 5,
  profile_sports_with_level: 5,
  portrait_or_main_photo: 9,
  fullbody_photo: 9,
  profile_completed: 11,
  onboarding_completed: 11,
  onboarding_done: 11,
};

const MISSING_FIELD_I18N: Record<string, string> = {
  first_name: "onboarding_completion_field_first_name",
  birth_date: "onboarding_completion_field_birth_date",
  gender: "onboarding_completion_field_gender",
  looking_for: "onboarding_completion_field_looking_for",
  city: "onboarding_completion_field_city",
  latitude: "onboarding_completion_field_location",
  longitude: "onboarding_completion_field_location",
  discovery_radius_km: "onboarding_completion_field_radius",
  sport_match_preference: "onboarding_completion_field_sport_pref",
  profile_sports_rows: "onboarding_completion_field_sports",
  profile_sports_with_level: "onboarding_completion_field_sport_level",
  portrait_or_main_photo: "onboarding_completion_field_photo",
  fullbody_photo: "onboarding_completion_field_photo_activity",
};

function hasTrimmedText(value: unknown, minLen = 1): boolean {
  return typeof value === "string" && value.trim().length >= minLen;
}

function resolveSportsRowCount(
  profileRow: Record<string, unknown>,
  profileSportsRowCount: number,
): number {
  if (Number.isFinite(profileSportsRowCount) && profileSportsRowCount > 0) {
    return profileSportsRowCount;
  }
  const nested = profileRow.profile_sports;
  if (Array.isArray(nested) && nested.length > 0) return nested.length;
  const fromRow = Number(profileRow.onboarding_sports_count ?? 0);
  return Number.isFinite(fromRow) && fromRow > 0 ? fromRow : 0;
}

function profileSportsRowsHaveValidLevels(profileRow: Record<string, unknown>): boolean {
  const nested = profileRow.profile_sports;
  if (!Array.isArray(nested) || nested.length === 0) return false;
  return nested.every((row) => {
    if (!row || typeof row !== "object") return false;
    const level = (row as { level?: unknown }).level;
    return hasValidSportPracticeLevel(typeof level === "string" ? level : null);
  });
}

/** Au moins un sport avec niveau valide (compteurs BDD ou lignes jointes). */
export function profileHasSportsWithValidLevels(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): boolean {
  const sportsCount = resolveSportsRowCount(profileRow, profileSportsRowCount);
  if (sportsCount < 1) return false;

  if (profileSportsRowsHaveValidLevels(profileRow)) return true;

  const withLevel = Number(profileRow.onboarding_sports_with_level_count ?? 0);
  const total = Number(profileRow.onboarding_sports_count ?? sportsCount);
  return (
    Number.isFinite(withLevel) &&
    Number.isFinite(total) &&
    withLevel >= 1 &&
    total >= 1 &&
    withLevel === total
  );
}

function hasBirthDate(profileRow: Record<string, unknown>): boolean {
  const raw = profileRow.birth_date;
  if (typeof raw !== "string") return false;
  return raw.trim().length > 0;
}

function auditResultFromGaps(missing: string[]): { ok: true } | { ok: false; missingFields: string[]; suggestedStep: number } {
  if (missing.length === 0) return { ok: true };
  const steps = missing.map((f) => FIELD_TO_STEP[f] ?? 11).filter(Number.isFinite);
  const suggestedStep = steps.length > 0 ? Math.min(...steps) : 11;
  return { ok: false, missingFields: missing, suggestedStep };
}

/** Données critiques (sans drapeaux BDD) — utilisé avant submit onboarding et pour exclure les profils fantômes du feed. */
export function collectProfileCriticalDataGaps(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): string[] {
  const missing: string[] = [];
  const sportsCount = resolveSportsRowCount(profileRow, profileSportsRowCount);

  if (!hasTrimmedText(profileRow.first_name)) missing.push("first_name");
  if (!hasBirthDate(profileRow)) missing.push("birth_date");
  if (!hasTrimmedText(profileRow.gender)) missing.push("gender");
  if (!hasTrimmedText(profileRow.looking_for)) missing.push("looking_for");
  if (!(typeof profileRow.city === "string" && profileRow.city.trim().length >= 2)) {
    missing.push("city");
  }
  if (!isFiniteCoordinate(profileRow.latitude)) missing.push("latitude");
  if (!isFiniteCoordinate(profileRow.longitude)) missing.push("longitude");
  if (!isValidDiscoveryRadiusKm(profileRow.discovery_radius_km)) {
    missing.push("discovery_radius_km");
  }
  if (sportsCount < 1) missing.push("profile_sports_rows");
  if (!profileHasSportsWithValidLevels(profileRow, profileSportsRowCount)) {
    missing.push("profile_sports_with_level");
  }
  if (!hasPortraitOrMainPhoto(profileRow)) missing.push("portrait_or_main_photo");
  if (!hasFullbodyPhoto(profileRow)) missing.push("fullbody_photo");

  return missing;
}

function collectOnboardingFlagGaps(profileRow: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (profileRow.profile_completed !== true) missing.push("profile_completed");
  if ((profileRow as { onboarding_completed?: unknown }).onboarding_completed !== true) {
    missing.push("onboarding_completed");
  }
  const od = (profileRow as { onboarding_done?: unknown }).onboarding_done;
  const oc = (profileRow as { onboarding_completed?: unknown }).onboarding_completed === true;
  const pc = profileRow.profile_completed === true;
  if (od !== true && !(pc && oc && od !== false)) {
    missing.push("onboarding_done");
  }
  return missing;
}

/** Audit données seules (submit onboarding avant pose des drapeaux). */
export function auditProfileCriticalDataForDiscover(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
):
  | { ok: true }
  | { ok: false; missingFields: string[]; suggestedStep: number } {
  return auditResultFromGaps(collectProfileCriticalDataGaps(profileRow, profileSportsRowCount));
}

/**
 * Garde-finale avant Discover : données critiques + drapeaux cohérents (reload session / post-submit).
 */
export function auditOnboardingProfileForDiscover(
  profileRow: Record<string, unknown>,
  profileSportsRowCount: number,
):
  | { ok: true }
  | { ok: false; missingFields: string[]; suggestedStep: number } {
  const missing = [
    ...collectProfileCriticalDataGaps(profileRow, profileSportsRowCount),
    ...collectOnboardingFlagGaps(profileRow),
  ];
  return auditResultFromGaps(missing);
}

/**
 * Garde session / Discover : champs bloquants uniquement + `profile_completed`.
 * Les préférences optionnelles (âge, sport_match_preference, vérif identité) ne bloquent pas.
 */
export function isProfileReadyForDiscover(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): boolean {
  if (collectProfileCriticalDataGaps(profileRow, profileSportsRowCount).length > 0) {
    return false;
  }
  return profileRow.profile_completed === true;
}

export function computeStrictCompletionFlags(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): {
  profile_completed: boolean;
  onboarding_completed: boolean;
  onboarding_done: boolean;
} {
  const ok = collectProfileCriticalDataGaps(profileRow, profileSportsRowCount).length === 0;
  return {
    profile_completed: ok,
    onboarding_completed: ok,
    onboarding_done: ok,
  };
}

/** Raisons d’exclusion feed Discover (profils fantômes / incohérents). */
export function getDiscoverFeedIntegrityExclusionReasons(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): string[] {
  const reasons: string[] = [];
  for (const gap of collectProfileCriticalDataGaps(profileRow, profileSportsRowCount)) {
    reasons.push(`missing_${gap}`);
  }
  for (const gap of collectOnboardingFlagGaps(profileRow)) {
    reasons.push(`missing_${gap}`);
  }
  if (profileRow.profile_completed === true && reasons.length > 0) {
    reasons.push("ghost_profile_completed_flag");
  }
  return reasons;
}

export function isDiscoverFeedProfileIntegrityOk(
  profileRow: Record<string, unknown>,
  profileSportsRowCount = 0,
): boolean {
  return getDiscoverFeedIntegrityExclusionReasons(profileRow, profileSportsRowCount).length === 0;
}

/** Message utilisateur quand la validation stricte échoue. */
export function messageForDiscoverReadinessGap(
  missingFields: string[],
  t: (key: string) => string,
): string {
  const labels = missingFields.map((field) => {
    const key = MISSING_FIELD_I18N[field];
    return key ? t(key) : field;
  });
  const base = t("onboarding_discover_readiness_blocked");
  if (labels.length === 0) return base;
  return `${base} ${t("onboarding_completion_missing_prefix")} ${labels.join(", ")}.`;
}
