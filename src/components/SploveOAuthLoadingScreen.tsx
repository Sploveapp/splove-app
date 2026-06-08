import { SplashScreen } from "./SplashScreen";

/**
 * Overlay plein écran pendant OAuth Google (Capacitor iOS/Android).
 * Fond noir, logo SPLove, marque + slogan — aucune URL / Safari visible dans l’app.
 */
export function SploveOAuthLoadingScreen() {
  return <SplashScreen overlay />;
}
