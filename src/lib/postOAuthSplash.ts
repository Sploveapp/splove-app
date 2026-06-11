import { isNativeCapacitorApp } from "./authRedirect";

/** Garde-fou : masque l’overlay OAuth si le callback ne termine jamais. */
export const POST_OAUTH_MAX_MS = 120_000;

let postOAuthSplashRequested = false;
let postOAuthSplashActive = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Déclenché au clic « Continuer avec Google » (transition vers Discover). */
export function beginPostOAuthSplash(): void {
  if (!isNativeCapacitorApp()) return;
  postOAuthSplashRequested = true;
  notifyListeners();
}

/** Masque le splash dès que la session OAuth est OK (navigation Discover). */
export function dismissPostOAuthSplash(): void {
  if (!isNativeCapacitorApp()) return;
  postOAuthSplashRequested = false;
  postOAuthSplashActive = false;
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
  postOAuthSplashRequested = false;
  postOAuthSplashActive = false;
}

export function isPostOAuthSplashActive(): boolean {
  return postOAuthSplashActive;
}

/** Alias — évite de toucher Discover. */
export function isColdStartSplashActive(): boolean {
  return postOAuthSplashActive;
}
