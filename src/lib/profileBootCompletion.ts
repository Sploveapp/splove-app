import { isProfileReadyForDiscover } from "./onboardingDiscoverReadiness";

/** `onboarding_completed: null` (ou colonne absente du select) ≠ profil incomplet. */
export function areProfileCompletionFlagsUnsettled(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row?.id) return true;
  if (row.profile_completed === true || row.onboarding_completed === true || row.onboarding_done === true) {
    return false;
  }
  if (row.profile_completed === false || row.onboarding_completed === false || row.onboarding_done === false) {
    return false;
  }
  return true;
}

/** Aligné sur `AuthContext.isProfileComplete` (drapeaux BDD puis audit données). */
export function isProfileCompleteForMove(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  if (!profile?.id) return false;
  if (profile.profile_completed === true) return true;
  if (profile.onboarding_completed === true) return true;
  if (profile.onboarding_done === true) return true;
  const sportsCount = Number(profile.onboarding_sports_count ?? 0);
  return isProfileReadyForDiscover(
    profile,
    Number.isFinite(sportsCount) ? sportsCount : 0,
  );
}
