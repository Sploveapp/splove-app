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
