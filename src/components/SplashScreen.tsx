import { APP_BG } from "../constants/theme";

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
        <svg
          className="h-[104px] w-[104px] overflow-visible"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <g className="splash-orbit-g">
            <ellipse
              cx="16"
              cy="10.2"
              rx="12.25"
              ry="6.85"
              transform="rotate(-13 16 10.2)"
              stroke="#FF3B3B"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          <path
            fill="#E11D2E"
            d="M16 6.1 C13.5 6.1 11.2 8 11.2 10.8 C11.2 14.2 16 18.4 16 22.1 C16 18.4 20.8 14.2 20.8 10.8 C20.8 8 18.5 6.1 16 6.1 Z"
          />
        </svg>
      </div>
    </div>
  );
}
