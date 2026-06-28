import { Capacitor } from "@capacitor/core";
import { isGoogleOAuthNativePlatform } from "./authRedirect";
import { beginPostOAuthSplash } from "./postOAuthSplash";
import {
  awaitGoogleSignInOverlayPaint,
  hideGoogleSignInOverlay,
  isGoogleSignInOverlayMounted,
  showGoogleSignInOverlay,
} from "./googleSignInOverlay";

/** Flux Google OAuth navigateur sur Capacitor iOS (hors Android, hors web). */
export function isIosGoogleOAuthBrowserFlow(): boolean {
  return isGoogleOAuthNativePlatform() && Capacitor.getPlatform() === "ios";
}

let iosOAuthConnectingVisible = false;

export function isIosGoogleOAuthConnectingVisible(): boolean {
  return iosOAuthConnectingVisible || isGoogleSignInOverlayMounted();
}

/** Affiche « Connexion sécurisée… » dans l’app avant Browser.open (iOS uniquement). */
export async function showIosGoogleOAuthConnectingOverlay(): Promise<void> {
  if (!isIosGoogleOAuthBrowserFlow()) return;
  iosOAuthConnectingVisible = true;
  beginPostOAuthSplash();
  showGoogleSignInOverlay();
  await awaitGoogleSignInOverlayPaint();
  console.log("IOS_GOOGLE_OAUTH_DISPLAY_SHOW");
}

/** Masque l’overlay dès APP_URL_OPEN, AUTH_CALLBACK ou GOOGLE_SIGNIN_SUCCESS. */
export function hideIosGoogleOAuthConnectingOverlay(trigger: string): void {
  if (!isIosGoogleOAuthBrowserFlow()) return;
  if (!iosOAuthConnectingVisible && !isGoogleSignInOverlayMounted()) return;
  iosOAuthConnectingVisible = false;
  hideGoogleSignInOverlay(trigger);
  console.log("IOS_GOOGLE_OAUTH_DISPLAY_HIDE", { trigger });
}

/** Test helper */
export function resetIosGoogleOAuthDisplayForTests(): void {
  iosOAuthConnectingVisible = false;
}
