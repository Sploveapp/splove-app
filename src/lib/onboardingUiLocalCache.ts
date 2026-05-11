/**
 * Clés réservées pour un futur brouillon onboarding côté client.
 * Si le profil serveur est déjà complet, on purge pour éviter UX bloquée (ex. étape restaurée).
 */
const ONBOARDING_UI_LOCAL_KEYS = [
  "splove_onboarding_ui_v1",
  "splove_onboarding_step_v1",
  "splove_onboarding_draft_v1",
] as const;

export function clearOnboardingUiLocalCache(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of ONBOARDING_UI_LOCAL_KEYS) {
      window.localStorage.removeItem(k);
      window.sessionStorage.removeItem(k);
    }
  } catch {
    /* quota / private mode */
  }
}
