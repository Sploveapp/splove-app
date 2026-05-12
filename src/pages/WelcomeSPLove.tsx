import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { APP_BORDER, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import { useLocalDayNightPhase } from "../hooks/useLocalDayNightPhase";
import welcomeLogoMark from "../assets/welcome/splove-mark.png";
import tileRunning from "../assets/welcome/tile-running.webp";
import tileCycling from "../assets/welcome/tile-cycling.webp";
import tileRunningAlt from "../assets/welcome/tile-running-alt.webp";

/**
 * Porte d’entrée visuelle publique (avant auth / onboarding).
 * Ne réutilise pas SplashScreen : celui-ci reste réservé au chargement session / profil.
 * Images locales (import Vite) : plus de dépendance aux URLs Unsplash / hotlinking Render.
 */

/** Mosaïque 2×2 — quatre visuels sport (maquette). */
const WELCOME_TILES = [
  { src: tileRunning, objectPosition: "50% 42%" },
  { src: tileCycling, objectPosition: "50% 48%" },
  { src: tileRunning, objectPosition: "22% 44%" },
  { src: tileRunningAlt, objectPosition: "78% 40%" },
] as const;

function WelcomePhotoTile({
  src,
  objectPosition,
  isDay,
}: {
  src: string;
  objectPosition: string;
  isDay: boolean;
}) {
  const [didError, setDidError] = useState(false);
  const fallbackBg = isDay
    ? "linear-gradient(135deg, #dce3ee 0%, #c5d0e3 42%, #e7eaef 100%)"
    : "linear-gradient(135deg, #1a1a22 0%, #101018 48%, #07070b 100%)";

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={{ background: fallbackBg }}>
      {!didError ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
          draggable={false}
          style={{ objectPosition, transform: "scale(1.03)" }}
          onError={() => setDidError(true)}
        />
      ) : null}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: isDay
            ? "linear-gradient(180deg, rgba(231,234,239,0.42) 0%, rgba(231,234,239,0.78) 55%, rgba(231,234,239,0.93) 100%)"
            : "linear-gradient(180deg, rgba(5,5,8,0.28) 0%, rgba(5,5,8,0.68) 48%, rgba(5,5,8,0.9) 100%)",
        }}
      />
    </div>
  );
}

function SportIconRow({ stroke }: { stroke: string }) {
  const common = {
    fill: "none" as const,
    stroke,
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <div
      className="flex w-full max-w-[min(100%,22rem)] items-center justify-between gap-0.5 px-0.5 opacity-[0.92]"
      aria-hidden
    >
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <path d="M7 18c1.5-2 2-4 2-6s-.5-4-2-6M17 18c-1.5-2-2-4-2-6s.5-4 2-6" />
        <ellipse cx="12" cy="12" rx="3" ry="1.5" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <ellipse cx="12" cy="14" rx="6" ry="3" />
        <path d="M6 14V9l6-3 6 3v5" />
        <path d="M12 6V3" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <circle cx="8" cy="16" r="3.25" />
        <circle cx="16" cy="16" r="3.25" />
        <path d="M5.5 16V11L12 7l6.5 4v5" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <path d="M8 18V6l8-2v14" />
        <path d="M8 11h8" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 5v14M5 12h14" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <circle cx="12" cy="12" r="7.25" />
        <path d="M12 5a7 7 0 0 1 0 14 7 7 0 0 1 0-14Z" />
        <path d="M5 12h14" />
      </svg>
      <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" {...common}>
        <path d="M6 19l4-12 2 6 2-3 4 9" />
        <circle cx="17" cy="19" r="1.35" />
        <circle cx="7" cy="19" r="1.35" />
      </svg>
    </div>
  );
}

const LOGO_PUBLIC_FALLBACK = `${import.meta.env.BASE_URL}logo.png`.replace(/\/{2,}/g, "/");

export default function WelcomeSPLove() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useTranslation();
  const dayNight = useLocalDayNightPhase();
  const isDay = dayNight === "day";
  const { user, isAuthInitialized, isLoading, isProfileLoading, isProfileComplete } = useAuth();
  const [logoSrc, setLogoSrc] = useState<string>(welcomeLogoMark);

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
      navigate("/onboarding", { replace: true });
      return;
    }
    navigate("/auth?signup=1", { replace: true });
  }

  function goCompteExistant() {
    if (!navigationReady) return;
    navigate("/auth", { replace: true });
  }

  const langPill = (lang: "fr" | "en") =>
    ({
      padding: "5px 10px",
      borderRadius: "999px",
      border: "none",
      background: language === lang ? BRAND_BG : "transparent",
      color:
        language === lang
          ? TEXT_ON_BRAND
          : isDay
            ? "rgba(24,24,27,0.45)"
            : "rgba(255,255,255,0.55)",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.06em",
      cursor: "pointer",
    }) satisfies CSSProperties;

  const pageBg = isDay ? "#E7EAEF" : "#050508";
  const textMain = isDay ? "#18181B" : "#fafafa";
  const textSoft = isDay ? "rgba(24,24,27,0.72)" : "rgba(255,255,255,0.9)";
  /** Maquette : icônes fines blanches sur fond sombre ; jour : accent marque. */
  const sportIconStroke = isDay ? BRAND_BG : "rgba(255,255,255,0.88)";
  const langShellBorder = isDay ? "rgba(24,24,27,0.12)" : APP_BORDER;
  const langShellBg = isDay ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.05)";
  const scrimGradient = isDay
    ? "linear-gradient(180deg, rgba(231,234,239,0.12) 0%, rgba(231,234,239,0.5) 32%, rgba(231,234,239,0.88) 62%, #E7EAEF 100%)"
    : "linear-gradient(180deg, rgba(5,5,8,0.1) 0%, rgba(5,5,8,0.52) 36%, rgba(5,5,8,0.9) 66%, #050508 100%)";

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: pageBg, color: textMain }}
    >
      <div
        role="group"
        aria-label={t("language")}
        className="absolute right-4 z-20 flex items-center gap-0.5 rounded-full border p-0.5 shadow-sm backdrop-blur-md"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          borderColor: langShellBorder,
          background: langShellBg,
        }}
      >
        <button type="button" aria-label={t("french")} aria-pressed={language === "fr"} onClick={() => setLanguage("fr")} style={langPill("fr")}>
          FR
        </button>
        <span aria-hidden className="px-0.5 text-[11px] opacity-30">
          |
        </span>
        <button type="button" aria-label={t("english")} aria-pressed={language === "en"} onClick={() => setLanguage("en")} style={langPill("en")}>
          EN
        </button>
      </div>

      {/* Mosaïque 2×2 plein écran — comme la maquette (photos derrière le contenu). */}
      <div className="absolute inset-0 z-0 grid min-h-[100dvh] grid-cols-2 grid-rows-2 gap-px bg-black/35">
        {WELCOME_TILES.map((tile, i) => (
          <WelcomePhotoTile key={i} src={tile.src} objectPosition={tile.objectPosition} isDay={isDay} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: scrimGradient }} aria-hidden />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(3.25rem,env(safe-area-inset-top))] sm:max-w-[21rem] md:max-w-[22rem] md:px-6">
        <div className="splove-content-reveal mx-auto flex w-full flex-col items-center text-center">
            <div className="flex items-center justify-center gap-1 sm:gap-1.5" role="img" aria-label="SPLove">
              <span aria-hidden className="text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]" style={{ color: textMain }}>
                SPL
              </span>
              <img
                src={logoSrc}
                alt=""
                width={72}
                height={72}
                className="h-[3.1rem] w-[3.1rem] shrink-0 object-contain sm:h-[3.35rem] sm:w-[3.35rem]"
                decoding="async"
                draggable={false}
                aria-hidden
                onError={() => {
                  setLogoSrc((prev) => (prev !== LOGO_PUBLIC_FALLBACK ? LOGO_PUBLIC_FALLBACK : prev));
                }}
              />
              <span aria-hidden className="text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.2rem]" style={{ color: textMain }}>
                VE
              </span>
            </div>
            <p
              className="mt-2 max-w-[22rem] text-[0.65rem] font-semibold uppercase leading-snug tracking-[0.2em] sm:text-[0.68rem] sm:tracking-[0.22em]"
              style={{ color: textSoft }}
            >
              {t("welcome_tagline")}
            </p>

          <p className="mt-2 max-w-[20rem] text-lg font-semibold leading-snug tracking-[-0.015em] sm:mt-2.5 sm:text-xl">
            <span style={{ color: textMain }}>{t("welcome_slogan_part1")}</span>
            <span style={{ color: BRAND_BG }}>{t("welcome_slogan_accent")}</span>
          </p>

          <div className="mt-3 w-full max-w-[min(100%,22rem)] sm:mt-3.5">
            <SportIconRow stroke={sportIconStroke} />
          </div>

          <div className="mt-5 flex w-full max-w-[min(100%,22rem)] flex-col gap-2.5 sm:mt-5">
            <button
              type="button"
              onClick={goCommencer}
              disabled={!navigationReady}
              className="w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                backgroundColor: BRAND_BG,
                color: TEXT_ON_BRAND,
                boxShadow: isDay ? "0 10px 28px rgba(255,30,45,0.2)" : "0 10px 32px rgba(0,0,0,0.45)",
              }}
            >
              {t("welcome_cta_start")}
            </button>
            <button
              type="button"
              onClick={goCompteExistant}
              disabled={!navigationReady}
              className="w-full rounded-2xl border-2 py-3.5 text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                borderColor: isDay ? "rgba(24,24,27,0.25)" : "rgba(255,255,255,0.9)",
                background: isDay ? "rgba(255,255,255,0.5)" : "transparent",
                color: textMain,
              }}
            >
              {t("welcome_cta_has_account")}
            </button>
          </div>

          <p
            className="mt-2.5 max-w-md px-0.5 text-center text-[11px] leading-relaxed sm:text-xs"
            style={{ color: isDay ? "rgba(24,24,27,0.55)" : "rgba(161,161,170,0.96)" }}
          >
            {t("welcome_legal_part1")}
            <Link
              to="/cgu"
              className="font-medium underline-offset-[3px] decoration-transparent transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: BRAND_BG, outlineColor: BRAND_BG }}
            >
              {t("welcome_legal_link_terms")}
            </Link>
            {t("welcome_legal_part2")}
            <Link
              to="/privacy"
              className="font-medium underline-offset-[3px] decoration-transparent transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: BRAND_BG, outlineColor: BRAND_BG }}
            >
              {t("welcome_legal_link_privacy")}
            </Link>
            {t("welcome_legal_part3")}
          </p>
        </div>
      </main>
    </div>
  );
}
