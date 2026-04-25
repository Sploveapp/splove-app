import SploveLoader from "./SploveLoader";

/**
 * Écran de démarrage léger : branding SPLove statique.
 * Afficher tant que `AuthContext` ou une route équivalente est en chargement initial.
 */
export function SplashScreen() {
  return (
    <div
      className="flex h-screen w-full items-center justify-center px-6"
      style={{ backgroundColor: "#0B0B0F" }}
      role="status"
      aria-live="polite"
      aria-label="Chargement de SPLove"
    >
      <div style={{ opacity: 0, animation: "splashLogoFadeIn 400ms ease-out forwards" }}>
        <SploveLoader />
      </div>
      <style>{`
        @keyframes splashLogoFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
