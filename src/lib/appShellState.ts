export type AppShellState = {
  /** Session Supabase initialisée (getSession terminé). */
  authResolved: boolean;
  /** Profil minimal chargé pour l'utilisateur connecté (premier boot). */
  profileResolved: boolean;
  /** Auth OK + (invité ou profil prêt) — routes authentifiées autorisées. */
  appReady: boolean;
};

export function resolveAppShellState(input: {
  isAuthInitialized: boolean;
  isLoading: boolean;
  sessionUserId: string | null | undefined;
  profileId: string | null | undefined;
}): AppShellState {
  const authResolved = input.isAuthInitialized && !input.isLoading;
  const uid = input.sessionUserId?.trim() || null;
  const profileResolved = Boolean(uid && input.profileId === uid);
  const appReady = authResolved && (!uid || profileResolved);

  return { authResolved, profileResolved, appReady };
}
