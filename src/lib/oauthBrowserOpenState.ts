/** État navigateur OAuth Capacitor — couche affichage uniquement (pas de logique auth). */
let oauthBrowserOpen = false;

export function markOAuthBrowserOpen(open: boolean): void {
  oauthBrowserOpen = open;
}

export function isOAuthBrowserOpen(): boolean {
  return oauthBrowserOpen;
}

/** Test helper */
export function resetOAuthBrowserOpenStateForTests(): void {
  oauthBrowserOpen = false;
}
