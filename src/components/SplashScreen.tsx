import { APP_BG } from "../constants/theme";
import SploveLoader from "./SploveLoader";

/**
 * Écran de démarrage léger : logo cœur SPLove, orbite animée uniquement.
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
      <div className="relative flex h-[104px] w-[104px] items-center justify-center">
      <SploveLoader size={140} />
      </div>
    </div>
  );
}
