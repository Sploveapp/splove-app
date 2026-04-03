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
  portrait_url?: string | null;
  fullbody_url?: string | null;
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
