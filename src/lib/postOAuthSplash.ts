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

/** Timeout de secours post-OAuth (routing natif / navigateur). */
export const POST_OAUTH_ROUTING_SAFETY_MS = 1_500;

export function forceClearPostOAuthSplash(): void {
  markPostOAuthSplashComplete();
  notifyListeners();
}

export function abortPostOAuthSplash(): void {
  forceClearPostOAuthSplash();
}

export function isPostOAuthFinalLandingPath(pathname: string): boolean {
  const norm = pathname.replace(/^#/, "").split("?")[0]!.replace(/\/$/, "") || "/";
  return (
    norm === "/move" ||
    norm === "/onboarding" ||
    norm === "/identity-verification" ||
    norm === "/discover"
  );
}

export function tryDismissPostOAuthSplashAfterLanding(
  pathname: string,
  ctx: { hasSession: boolean; profileBound: boolean; isAuthInitialized: boolean },
): void {
  if (!isPostOAuthSplashRequested()) return;
  if (!ctx.hasSession || !ctx.profileBound || !ctx.isAuthInitialized) return;
  if (!isPostOAuthFinalLandingPath(pathname)) return;
  dismissPostOAuthSplash();
}
