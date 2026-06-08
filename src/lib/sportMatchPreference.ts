/**
 * `profiles.sport_match_preference`: stable DB enum controlling secondary Discover matches without shared sports.
 */

export type SportMatchPreferenceDb = "same_sports" | "open_to_different_sports" | "both";

const ALLOWED: readonly SportMatchPreferenceDb[] = [
  "same_sports",
  "open_to_different_sports",
  "both",
] as const;

export function parseSportMatchPreference(raw: unknown): SportMatchPreferenceDb {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (ALLOWED as readonly string[]).includes(s) ? (s as SportMatchPreferenceDb) : "same_sports";
}

/** Trace DB → scoring (évite confusion raw `both` vs parse fallback `same_sports`). */
export function logSportMatchPreferenceScoringTrace(
  stage: string,
  raw: unknown,
): { raw_db: string | null; normalized: SportMatchPreferenceDb } {
  const raw_db = typeof raw === "string" ? raw.trim() : raw == null || raw === undefined ? null : String(raw);
  const normalized = parseSportMatchPreference(raw);
  const used_same_sports_fallback =
    normalized === "same_sports" && (raw_db == null || raw_db === "" || !ALLOWED.includes(raw_db as SportMatchPreferenceDb));
  console.log("[Discover sport_match_preference]", {
    stage,
    raw_db_value: raw_db,
    normalized_value: normalized,
    final_scoring_value: normalized,
    used_same_sports_fallback,
  });
  return { raw_db, normalized };
}

export function discoverAllowsDifferentSports(pref: SportMatchPreferenceDb): boolean {
  return pref === "open_to_different_sports" || pref === "both";
}

/** Profils sans sport commun : uniquement si au moins une des deux préférences est ouverte. */
export function discoverCrossSportSecondaryAllowed(viewerPref: unknown, candidatePref: unknown): boolean {
  return (
    discoverAllowsDifferentSports(parseSportMatchPreference(viewerPref)) ||
    discoverAllowsDifferentSports(parseSportMatchPreference(candidatePref))
  );
}

/**
 * Peut-on montrer un candidat avec 0 sport en commun ?
 * Règle stricte : si le viewer a `same_sports`, au moins 1 sport commun est obligatoire
 * (la préférence du candidat ne contourne pas cela).
 */
export function discoverAllowsZeroSharedSports(viewerPref: unknown, candidatePref: unknown): boolean {
  if (parseSportMatchPreference(viewerPref) === "same_sports") return false;
  return discoverCrossSportSecondaryAllowed(viewerPref, candidatePref);
}
