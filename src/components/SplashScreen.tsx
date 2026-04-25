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
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          width={160}
          height={160}
          className="h-[130px] w-[130px] max-h-[130px] max-w-[130px] object-contain md:h-[160px] md:w-[160px] md:max-h-[160px] md:max-w-[160px]"
          decoding="async"
          draggable={false}
        />
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
