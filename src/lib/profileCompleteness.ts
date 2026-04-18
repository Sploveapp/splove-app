import { isAdultFromBirthIso } from "./ageGate";

/**
 * Vérifications optionnelles côté client (ex. formulaires).
 *
 * **Gating session / navigation** : voir `AuthContext` (`isProfileComplete`) — `profile_completed`
 * et âge ≥ 18 via `birth_date` (`isAdultFromBirthIso` dans `ageGate.ts`).
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
  /** `chill` | `intense` — migration 067 */
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
  const hasLocation =
    Boolean(profile.city?.trim() && profile.city.trim().length >= 2) ||
    (typeof profile.latitude === "number" && typeof profile.longitude === "number");
  const hasRadius = [10, 25, 50, 100].includes(Number(profile.discovery_radius_km ?? 0));
  const isAdult = Boolean(profile.birth_date && isAdultFromBirthIso(profile.birth_date));
  const hasPhotos = Boolean(profile.portrait_url?.trim() && profile.fullbody_url?.trim());
  const hasQuickPrefs =
    (profile.sport_time === "Matin" || profile.sport_time === "Soir") &&
    (profile.sport_intensity === "chill" || profile.sport_intensity === "intense") &&
    (profile.planning_style === "spontaneous" || profile.planning_style === "planned");
  const sportsCount = Number(profile.onboarding_sports_count ?? 0);
  const sportsWithIntensity = Number(profile.onboarding_sports_with_level_count ?? 0);
  const hasSportsWithIntensity = sportsCount > 0 && sportsWithIntensity === sportsCount;
  return (
    hasBaseIdentity &&
    isAdult &&
    hasLocation &&
    hasRadius &&
    hasPhotos &&
    hasQuickPrefs &&
    hasSportsWithIntensity
  );
}
