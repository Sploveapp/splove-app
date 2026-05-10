import { isValidDiscoveryRadiusKm } from "../constants/discoverGeo";
import { isAdultFromBirthIso } from "./ageGate";

/**
 * Vérifications optionnelles côté client (ex. formulaires).
 *
 * **Gating session / navigation** : `AuthContext` utilise `profile_completed` (BDD) + âge ≥ 18
 * (`isAdultFromBirthIso`). `isOnboardingComplete` sert aux formulaires / validation locale,
 * pas au route guard.
 */
export type ProfileCompletenessInput = {
  first_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  discovery_radius_km?: number | null;
  sport_time?: string | null;
  /** Legacy `chill` | `intense`; onboarding A/B extends with dynamic/both/active/relaxed/flexible — migration 087 */
  sport_intensity?: string | null;
  /** `fun` | `real_meeting` | `both` — migration 067 */
  meet_vibe?: string | null;
  /** `spontaneous` | `planned` — migration 068 */
  planning_style?: string | null;
  sport_phrase?: string | null;
  needs_adapted_activities?: boolean | null;
  practice_preferences?: string[] | null;
  onboarding_sports_count?: number | null;
  onboarding_sports_with_level_count?: number | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  onboarding_completed?: boolean | null;
  profile_completed?: boolean | null;
};

/** Indicatif : les champs typiques d’un profil « rempli » (pas la source de vérité pour les routes). */
export function computeProfileCompleted(profile: ProfileCompletenessInput): boolean {
  return Boolean(
    profile.first_name?.trim() &&
      profile.birth_date &&
      profile.gender &&
      profile.looking_for &&
      profile.intent &&
      profile.portrait_url?.trim() &&
      profile.fullbody_url?.trim()
  );
}

export function isProfileComplete(
  profile: ProfileCompletenessInput | null | undefined
): boolean {
  if (!profile) return false;
  return computeProfileCompleted(profile);
}

export function isOnboardingComplete(profile: ProfileCompletenessInput | null | undefined): boolean {
  if (!profile) return false;
  const hasBaseIdentity = Boolean(
    profile.first_name?.trim() &&
      profile.birth_date &&
      profile.gender &&
      profile.looking_for &&
      profile.intent
  );
  const hasCoords =
    typeof profile.latitude === "number" &&
    typeof profile.longitude === "number" &&
    Number.isFinite(profile.latitude) &&
    Number.isFinite(profile.longitude);
  const hasCityText = Boolean(profile.city?.trim() && profile.city.trim().length >= 2);
  /** Discover nécessite ville + coordonnées exploitables (RPC distance + classement). */
  const hasLocation = hasCityText && hasCoords;
  const hasRadius = isValidDiscoveryRadiusKm(profile.discovery_radius_km);
  const isAdult = Boolean(profile.birth_date && isAdultFromBirthIso(profile.birth_date));
  const hasPhotos = Boolean(profile.portrait_url?.trim() && profile.fullbody_url?.trim());

  const sportsCount = Number(profile.onboarding_sports_count ?? 0);
  const sportsWithIntensity = Number(profile.onboarding_sports_with_level_count ?? 0);
  const hasSportsWithIntensity = sportsCount > 0 && sportsWithIntensity === sportsCount;
  return (
    hasBaseIdentity &&
    isAdult &&
    hasLocation &&
    hasRadius &&
    hasPhotos &&
    hasSportsWithIntensity
  );
}
