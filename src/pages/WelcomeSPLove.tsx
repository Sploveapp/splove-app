import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

/**
 * Porte d’entrée visuelle publique (avant auth / onboarding).
 * Ne réutilise pas SplashScreen : celui-ci reste réservé au chargement session / profil.
 */

const SPORT_TILE_IMAGES = [
  "https://images.unsplash.com/photo-1571019613454-1cb2e99899d4?auto=format&fit=crop&w=720&q=75",
  "https://images.unsplash.com/photo-1595434094343-9ed4b5de3985?auto=format&fit=crop&w=720&q=75",
  "https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&w=720&q=75",
  "https://images.unsplash.com/photo-1551632811-567ad4aea806?auto=format&fit=crop&w=720&q=75",
] as const;

function SportIconRow() {
  const stroke = "rgba(255,255,255,0.82)";
  const common = { fill: "none", stroke, strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <div className="flex w-full max-w-[min(100%,22rem)] items-center justify-between gap-1 px-1 opacity-[0.88]" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <path d="M7 18c1.5-2 2-4 2-6s-.5-4-2-6M17 18c-1.5-2-2-4-2-6s.5-4 2-6" />
        <ellipse cx="12" cy="12" rx="3" ry="1.5" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <ellipse cx="12" cy="14" rx="6" ry="3" />
        <path d="M6 14V9l6-3 6 3v5" />
        <path d="M12 6V3" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <circle cx="8" cy="16" r="3.25" />
        <circle cx="16" cy="16" r="3.25" />
        <path d="M5.5 16V11L12 7l6.5 4v5" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <path d="M8 18V6l8-2v14" />
        <path d="M8 11h8" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 5v14M5 12h14" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="7.25" />
        <path d="M12 5a7 7 0 0 1 0 14 7 7 0 0 1 0-14Z" />
        <path d="M5 12h14" />
      </svg>
    </div>
  );
}

export default function WelcomeSPLove() {
  const navigate = useNavigate();
  const { user, isAuthInitialized, isLoading, isProfileLoading, isProfileComplete } = useAuth();

  useEffect(() => {
    if (!isAuthInitialized || isLoading || isProfileLoading) return;
    if (user?.id && isProfileComplete) {
      navigate("/discover", { replace: true });
    }
  }, [user?.id, isProfileComplete, isAuthInitialized, isLoading, isProfileLoading, navigate]);

  /** Session prête ; si connecté, attendre le profil pour ne pas envoyer au mauvais écran. */
  const navigationReady =
    isAuthInitialized && !isLoading && (!user?.id || !isProfileLoading);

  function goCommencer() {
    if (!navigationReady) return;
    if (user?.id) {
      // Toujours l’onboarding existant : les guards (audit, flags) décident ensuite (ex. Discover).
      navigate("/onboarding", { replace: true });
      return;
    }
    // Nouveau parcours : inscription puis onboarding (même entrée qu’avant la page d’accueil).
    navigate("/auth?signup=1", { replace: true });
  }

  function goCompteExistant() {
    if (!navigationReady) return;
    // Toujours l’écran Auth existant (email / Google inchangés) ; redirection post-login inchangée dans Auth.
    navigate("/auth", { replace: true });
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#050508] text-app-text">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-black/80">
          {SPORT_TILE_IMAGES.map((src) => (
            <div key={src} className="relative min-h-[28vh] overflow-hidden sm:min-h-[32vh]">
              <img src={src} alt="" className="h-full w-full scale-105 object-cover" loading="eager" decoding="async" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20" />
            </div>
          ))}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 85% at 50% 18%, rgba(255,30,45,0.12) 0%, transparent 42%), linear-gradient(180deg, rgba(5,5,8,0.55) 0%, rgba(5,5,8,0.88) 48%, rgba(5,5,8,0.96) 100%)",
          }}
        />
      </div>

      <main className="relative z-10 flex min-h-[100dvh] flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="splove-content-reveal flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span className="text-[2.1rem] font-extrabold tracking-tight text-white sm:text-[2.45rem]">SPL</span>
              <img
                src="/logo.png"
                alt=""
                width={72}
                height={72}
                className="h-[3.35rem] w-[3.35rem] object-contain sm:h-[3.75rem] sm:w-[3.75rem]"
                decoding="async"
                draggable={false}
                aria-hidden
              />
              <span className="text-[2.1rem] font-extrabold tracking-tight text-white sm:text-[2.45rem]">VE</span>
            </div>
            <p className="max-w-[22rem] text-[0.68rem] font-semibold uppercase leading-snug tracking-[0.2em] text-white/90 sm:text-[0.72rem] sm:tracking-[0.22em]">
              Trouver l’amour par le sport
            </p>
          </div>

          <p className="mt-8 max-w-[18rem] text-lg font-semibold leading-tight sm:max-w-[20rem] sm:text-xl">
            <span className="text-white">Bouge. Matche. </span>
            <span style={{ color: BRAND_BG }}>Rencontre.</span>
          </p>

          <div className="mt-6">
            <SportIconRow />
          </div>
        </div>

        <div className="splove-content-reveal mx-auto mt-auto flex w-full max-w-md flex-col gap-3">
          <button
            type="button"
            onClick={goCommencer}
            disabled={!navigationReady}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg shadow-black/35 transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            Commencer
          </button>
          <button
            type="button"
            onClick={goCompteExistant}
            disabled={!navigationReady}
            className="w-full rounded-2xl border border-app-accent bg-transparent py-3.5 text-[15px] font-semibold text-white transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            J’ai déjà un compte
          </button>

          <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-app-muted sm:text-xs">
            En continuant, tu acceptes nos{" "}
            <Link
              to="/cgu"
              className="font-medium text-app-accent underline-offset-[3px] decoration-transparent transition-colors hover:underline hover:decoration-app-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            >
              CGU
            </Link>{" "}
            et notre{" "}
            <Link
              to="/privacy"
              className="font-medium text-app-accent underline-offset-[3px] decoration-transparent transition-colors hover:underline hover:decoration-app-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            >
              Politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
