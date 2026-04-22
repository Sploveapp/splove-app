import { APP_BG } from "../constants/theme";
import SploveLoader from "./SploveLoader";

/**
 * Écran de démarrage léger : branding SPLove statique.
 * Afficher tant que `AuthContext` ou une route équivalente est en chargement initial.
 */
export function SplashScreen() {
  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center px-6"
      style={{ background: APP_BG }}
      role="status"
      aria-live="polite"
      aria-label="Chargement de SPLove"
    >
      <SploveLoader />
    </div>
  );
}
