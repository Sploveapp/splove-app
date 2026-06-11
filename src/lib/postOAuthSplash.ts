/**
 * Overlay noir SPLove pendant OAuth natif (iOS / Android).
 *
 * Cycle de vie :
 * 1. `beginPostOAuthSplash()` — clic « Continuer avec Google »
 * 2. Overlay actif pendant callback `/auth/callback` et bootstrap session/profil
 * 3. SUCCÈS — `tryDismissPostOAuthSplashAfterLanding()` uniquement sur /move, /onboarding,
 *    /identity-verification avec session + profil liés
 * 4. ABORT — `abortPostOAuthSplash()` annulation, erreur OAuth, timeout garde-fou
 *
 * Interdit : tout dismiss avant navigation finale confirmée sur le chemin succès.
 */

import { isNativeCapacitorApp } from "./authRedirect";

/** Garde-fou : masque l’overlay OAuth si le callback ne termine jamais. */
export const POST_OAUTH_MAX_MS = 120_000;

/** Routes où l’overlay peut être retiré après chargement (chemin succès uniquement). */
export const POST_OAUTH_FINAL_ROUTES = ["/move", "/onboarding", "/identity-verification"] as const;

let postOAuthSplashRequested = false;
let postOAuthSplashActive = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function clearPostOAuthSplashState(): void {
  postOAuthSplashRequested = false;
  postOAuthSplashActive = false;
}

export function isPostOAuthFinalLandingPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return POST_OAUTH_FINAL_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
}

/** Déclenché au clic « Continuer avec Google » — reste actif jusqu’à la route finale. */
export function beginPostOAuthSplash(): void {
  if (!isNativeCapacitorApp()) return;
  postOAuthSplashRequested = true;
  notifyListeners();
}

/**
 * Annulation, erreur OAuth ou timeout — seul dismiss autorisé hors route finale.
 * Ne pas appeler sur le chemin succès (utiliser tryDismissPostOAuthSplashAfterLanding).
 */
export function abortPostOAuthSplash(): void {
  if (!isNativeCapacitorApp()) return;
  clearPostOAuthSplashState();
  notifyListeners();
}

export function subscribePostOAuthSplash(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPostOAuthSplashRequested(): boolean {
  return postOAuthSplashRequested;
}

export function markPostOAuthSplashActive(): void {
  postOAuthSplashActive = true;
}

export function markPostOAuthSplashComplete(): void {
  clearPostOAuthSplashState();
  notifyListeners();
}

export function isPostOAuthSplashActive(): boolean {
  return postOAuthSplashActive;
}

/**
 * Chemin succès uniquement — retire l’overlay après navigation vers la route finale
 * et liaison session ↔ profil confirmée.
 */
export function tryDismissPostOAuthSplashAfterLanding(
  pathname: string,
  opts: {
    hasSession: boolean;
    profileBound: boolean;
    isAuthInitialized: boolean;
  },
): void {
  if (!postOAuthSplashRequested) return;
  if (!opts.isAuthInitialized || !opts.hasSession || !opts.profileBound) return;
  if (!isPostOAuthFinalLandingPath(pathname)) return;
  clearPostOAuthSplashState();
  notifyListeners();
}

/** Alias — évite de toucher Discover. */
export function isColdStartSplashActive(): boolean {
  return postOAuthSplashActive;
}
