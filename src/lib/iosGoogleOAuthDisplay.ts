import { Capacitor } from "@capacitor/core";
import { isGoogleOAuthNativePlatform } from "./authRedirect";
import { beginPostOAuthSplash } from "./postOAuthSplash";
import { isOauthProcessingLocked } from "./oauthCallbackLock";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { isOAuthBrowserOpen } from "./oauthBrowserOpenState";
import {
  logOAuthMaskHide,
  logOAuthMaskShow,
  windowLocationHasTechnicalOAuthUrl,
} from "./oauthVisualMask";
import {
  awaitGoogleSignInOverlayPaint,
  hideGoogleSignInOverlay,
  isGoogleSignInOverlayMounted,
  showGoogleSignInOverlay,
} from "./googleSignInOverlay";
import { showSploveIosOAuthConnectingMask } from "./sploveIosGoogleOAuth";

/** Flux Google OAuth navigateur sur Capacitor iOS (hors Android, hors web). */
export function isIosGoogleOAuthBrowserFlow(): boolean {
  return isGoogleOAuthNativePlatform() && Capacitor.getPlatform() === "ios";
}

let iosOAuthConnectingVisible = false;

export function isIosGoogleOAuthConnectingVisible(): boolean {
  return iosOAuthConnectingVisible || isGoogleSignInOverlayMounted();
}

function shouldDeferIosOAuthMaskHide(_trigger: string): boolean {
  if (isOauthProcessingLocked()) return true;
  if (isOAuthBrowserOpen()) return true;
  if (windowLocationHasTechnicalOAuthUrl()) return true;
  if (isPostOAuthSplashRequested() || isPostOAuthSplashActive()) return true;
  return false;
}

/** Affiche « Connexion sécurisée… » dans l’app avant Browser.open (iOS uniquement). */
export async function showIosGoogleOAuthConnectingOverlay(): Promise<void> {
  if (!isIosGoogleOAuthBrowserFlow()) return;
  iosOAuthConnectingVisible = true;
  beginPostOAuthSplash();
  logOAuthMaskShow("ios_google_oauth_connecting");
  showGoogleSignInOverlay();
  await showSploveIosOAuthConnectingMask();
  await awaitGoogleSignInOverlayPaint();
  console.log("IOS_GOOGLE_OAUTH_DISPLAY_SHOW");
}

/**
 * Masque l’overlay uniquement quand l’URL n’est plus technique et les verrous OAuth sont levés.
 * APP_URL_OPEN / succès Google : différé tant que le splash doit rester visible.
 */
export function hideIosGoogleOAuthConnectingOverlay(trigger: string): void {
  if (!isIosGoogleOAuthBrowserFlow()) return;
  if (shouldDeferIosOAuthMaskHide(trigger)) {
    logOAuthMaskShow("hide_deferred", {
      trigger,
      oauthProcessingLocked: isOauthProcessingLocked(),
      oauthBrowserOpen: isOAuthBrowserOpen(),
      technicalOAuthUrl: windowLocationHasTechnicalOAuthUrl(),
      postOAuthSplashRequested: isPostOAuthSplashRequested(),
      postOAuthSplashActive: isPostOAuthSplashActive(),
    });
    return;
  }
  if (!iosOAuthConnectingVisible && !isGoogleSignInOverlayMounted()) return;
  iosOAuthConnectingVisible = false;
  hideGoogleSignInOverlay(trigger);
  logOAuthMaskHide(trigger);
  console.log("IOS_GOOGLE_OAUTH_DISPLAY_HIDE", { trigger });
}

/** Test helper */
export function resetIosGoogleOAuthDisplayForTests(): void {
  iosOAuthConnectingVisible = false;
}
