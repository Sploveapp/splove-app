import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isGoogleSignInOverlayMounted } from "./googleSignInOverlay";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isOAuthSessionVerifiedLatch } from "./oauthSessionVerifiedLatch";
import { isOAuthVisualMaskRequired } from "./oauthVisualMask";
import {
  isWebOAuthSplashActive,
  isWebOAuthSplashRequested,
} from "./webOAuthSplash";

/** Verrous / overlays qui peuvent afficher « Connexion sécurisée… ». */
export function collectOAuthLoadingScreenBlockers(): string[] {
  const reasons: string[] = [];
  if (isOauthProcessingLocked()) reasons.push("oauthProcessingLocked");
  if (isPostOAuthSplashRequested()) reasons.push("postOAuthSplashRequested");
  if (isPostOAuthSplashActive()) reasons.push("postOAuthSplashActive");
  if (isWebOAuthSplashRequested()) reasons.push("webOAuthSplashRequested");
  if (isWebOAuthSplashActive()) reasons.push("webOAuthSplashActive");
  if (isGoogleSignInOverlayMounted()) reasons.push("googleSignInOverlayMounted");
  return reasons;
}

/**
 * Masque l’écran OAuth dès que la session est validée (latch ou AuthContext),
 * même si les verrous module ne sont pas encore propagés au rendu React.
 */
export function shouldShowOAuthLoadingScreen(
  rawVisible: boolean,
  authSessionVerified: boolean,
): boolean {
  if (isOAuthVisualMaskRequired()) return true;

  // Web : cycle de vie explicite — ne pas masquer avant dismissWebOAuthSplash.
  if (isWebOAuthSplashRequested() || isWebOAuthSplashActive()) return true;

  if (!rawVisible) return false;
  if (isOAuthSessionVerifiedLatch()) return false;
  if (authSessionVerified) return false;
  return true;
}

export function shouldSuppressOAuthLoadingOnMoveRoute(
  pathname: string,
  hash: string,
  authSessionVerified: boolean,
): boolean {
  if (isOAuthVisualMaskRequired()) return false;
  const onMove = pathname === "/move" || hash.startsWith("#/move");
  if (!onMove) return false;
  return isOAuthSessionVerifiedLatch() || authSessionVerified;
}

let lastGateLogKey = "";

/** Test helper */
export function resetOAuthLoadingScreenDiagForTests(): void {
  lastGateLogKey = "";
}

export function logOAuthLoadingScreenGate(
  gate: string,
  visible: boolean,
  extraReasons: string[] = [],
): void {
  const blockers = collectOAuthLoadingScreenBlockers();
  const reasons = [...new Set([...blockers, ...extraReasons])];
  const key = `${gate}|${visible}|${reasons.join("+")}`;
  if (key === lastGateLogKey) return;
  lastGateLogKey = key;

  if (visible) {
    console.log("OAUTH_LOADING_SCREEN_SHOW", { gate, reasons });
    console.log("OAUTH_LOADING_SCREEN_REASON", { gate, reasons });
    return;
  }
  console.log("OAUTH_LOADING_SCREEN_HIDE", { gate, reasons });
}
