import { useEffect, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { APP_BORDER, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import { useLocalDayNightPhase } from "../hooks/useLocalDayNightPhase";

/**
 * Porte d’entrée visuelle publique (avant auth / onboarding).
 * Ne réutilise pas SplashScreen : celui-ci reste réservé au chargement session / profil.
 */

const SPORT_TILE_IMAGES = [
  "https://images.unsplash.com/photo-1571019613454-1cb2e99899d4?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1476480862126-297bfaa98591?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1551632811-567ad4aea806?auto=format&fit=crop&w=800&q=80",
] as const;

function SportIconRow({ stroke }: { stroke: string }) {
  const common = {
    fill: "none" as const,
    stroke,
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <div className="flex w-full max-w-[min(100%,24rem)] items-center justify-between gap-0.5 px-0.5 opacity-[0.92]" aria-hidden>
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
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <path d="M6 19l4-12 2 6 2-3 4 9" />
        <circle cx="17" cy="19" r="1.35" />
        <circle cx="7" cy="19" r="1.35" />
      </svg>
    </div>
  );
}

export default function WelcomeSPLove() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useTranslation();
  const dayNight = useLocalDayNightPhase();
  const isDay = dayNight === "day";
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
  const sportIconStroke = isDay ? BRAND_BG : "rgba(255,255,255,0.82)";
  const langShellBorder = isDay ? "rgba(24,24,27,0.12)" : APP_BORDER;
  const langShellBg = isDay ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.05)";

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden transition-colors duration-500"
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

      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-black/40">
          {SPORT_TILE_IMAGES.map((src) => (
            <div key={src} className="relative min-h-[28vh] overflow-hidden sm:min-h-[32vh]">
              <img src={src} alt="" className="h-full w-full scale-105 object-cover" loading="eager" decoding="async" />
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  background: isDay
                    ? "linear-gradient(180deg, rgba(231,234,239,0.5) 0%, rgba(231,234,239,0.82) 55%, rgba(231,234,239,0.94) 100%)"
                    : "linear-gradient(180deg, rgba(5,5,8,0.35) 0%, rgba(5,5,8,0.72) 48%, rgba(5,5,8,0.92) 100%)",
                }}
              />
            </div>
          ))}
        </div>
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: isDay ? 0.55 : 1,
            background:
              "radial-gradient(120% 85% at 50% 18%, rgba(255,30,45,0.14) 0%, transparent 42%), linear-gradient(180deg, rgba(5,5,8,0.08) 0%, rgba(5,5,8,0.2) 100%)",
          }}
        />
      </div>

      <main className="relative z-10 flex min-h-[100dvh] flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="splove-content-reveal flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span
                className="text-[2.1rem] font-extrabold tracking-tight sm:text-[2.45rem]"
                style={{ color: textMain }}
              >
                SPL
              </span>
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
              <span
                className="text-[2.1rem] font-extrabold tracking-tight sm:text-[2.45rem]"
                style={{ color: textMain }}
              >
                VE
              </span>
            </div>
            <p
              className="max-w-[22rem] text-[0.68rem] font-semibold uppercase leading-snug tracking-[0.2em] sm:text-[0.72rem] sm:tracking-[0.22em]"
              style={{ color: textSoft }}
            >
              {t("welcome_tagline")}
            </p>
          </div>

          <p className="mt-8 max-w-[18rem] text-lg font-semibold leading-tight sm:max-w-[20rem] sm:text-xl">
            <span style={{ color: textMain }}>{t("welcome_slogan_part1")}</span>
            <span style={{ color: BRAND_BG }}>{t("welcome_slogan_accent")}</span>
          </p>

          <div className="mt-6">
            <SportIconRow stroke={sportIconStroke} />
          </div>
        </div>

        <div className="splove-content-reveal mx-auto mt-auto flex w-full max-w-md flex-col gap-3">
          <button
            type="button"
            onClick={goCommencer}
            disabled={!navigationReady}
            className="w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            style={{
              backgroundColor: BRAND_BG,
              color: TEXT_ON_BRAND,
              boxShadow: isDay ? "0 12px 32px rgba(255,30,45,0.22)" : "0 12px 32px rgba(0,0,0,0.35)",
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
              borderColor: isDay ? "rgba(24,24,27,0.22)" : "rgba(255,255,255,0.85)",
              background: isDay ? "rgba(255,255,255,0.55)" : "transparent",
              color: textMain,
            }}
          >
            {t("welcome_cta_has_account")}
          </button>

          <p
            className="mt-2 px-1 text-center text-[11px] leading-relaxed sm:text-xs"
            style={{ color: isDay ? "rgba(24,24,27,0.55)" : "rgba(161,161,170,0.95)" }}
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
