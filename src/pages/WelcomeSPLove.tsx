import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { APP_BORDER, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import welcomeLogoMark from "../assets/welcome/splove-mark.png";
import { supabase } from "../lib/supabase";
import { oauthRedirectUrl } from "../lib/authRedirect";

function oauthErrorToUserMessage(err: unknown, language: "fr" | "en"): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_grant")) {
    return language === "en" ? "Incorrect email or password." : "Email ou mot de passe incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return language === "en"
      ? "Check your inbox to confirm your account."
      : "Verifie ta boite mail pour confirmer ton compte.";
  }
  if (m.includes("user already registered")) {
    return language === "en" ? "This account already exists. Log in." : "Ce compte existe deja. Connecte-toi.";
  }
  return language === "en"
    ? "Unable to sign in right now. Please try again."
    : "Connexion impossible. Reessaie dans un instant.";
}

/**
 * Porte d’entrée visuelle publique (avant auth / onboarding).
 * Fond vidéo plein écran (`/videos/splove-hero.mp4`) + overlay sombre premium.
 * Aucune mosaïque d’images, aucun texte d’arrière-plan : uniquement la vidéo
 * et un dégradé sombre pour la lisibilité. Fallback noir si la vidéo échoue.
 */

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
  const { user, isAuthInitialized, isLoading, isProfileLoading, isProfileComplete } = useAuth();
  const [logoSrc, setLogoSrc] = useState<string>(welcomeLogoMark);
  const [appleNotice, setAppleNotice] = useState(false);
  const appleTimerRef = useRef<number | undefined>(undefined);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (appleTimerRef.current !== undefined) window.clearTimeout(appleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAuthInitialized || isLoading || isProfileLoading) return;
    if (user?.id && isProfileComplete) {
      navigate("/move", { replace: true });
    }
  }, [user?.id, isProfileComplete, isAuthInitialized, isLoading, isProfileLoading, navigate]);

  /** Session prête ; si connecté, attendre le profil pour ne pas envoyer au mauvais écran. */
  const navigationReady =
    isAuthInitialized && !isLoading && (!user?.id || !isProfileLoading);

  function goCommencer() {
    if (!navigationReady) return;
    if (user?.id) {
      if (isProfileComplete) {
        navigate("/move", { replace: true });
        return;
      }
      navigate("/onboarding", { replace: true });
      return;
    }
    navigate("/auth?signup=1", { replace: true });
  }

  function handleAppleSoon() {
    if (!navigationReady) return;
    setOauthBanner(null);
    setAppleNotice(true);
    if (appleTimerRef.current !== undefined) window.clearTimeout(appleTimerRef.current);
    appleTimerRef.current = window.setTimeout(() => {
      setAppleNotice(false);
      appleTimerRef.current = undefined;
    }, 3500);
  }

  async function signInWithGoogle() {
    if (!navigationReady) return;
    setOauthBanner(null);
    setOauthLoading("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectUrl() },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setOauthBanner(oauthErrorToUserMessage(err, language));
    } finally {
      setOauthLoading(null);
    }
  }

  function goEmailAuth() {
    if (!navigationReady) return;
    navigate("/auth", { replace: false });
  }

  const langPill = (lang: "fr" | "en") =>
    ({
      padding: "5px 10px",
      borderRadius: "999px",
      border: "none",
      background: language === lang ? BRAND_BG : "transparent",
      color: language === lang ? TEXT_ON_BRAND : "rgba(255,255,255,0.65)",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.06em",
      cursor: "pointer",
    }) satisfies CSSProperties;

  const textMain = "#fafafa";
  const textSoft = "rgba(255,255,255,0.9)";
  const sportIconStroke = "rgba(255,255,255,0.88)";

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden"
      style={{ backgroundColor: "#050509", color: textMain }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <source src="/videos/splove-hero.mp4" type="video/mp4" />
      </video>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.65), rgba(0,0,0,0.82))",
        }}
      />

      <div
        role="group"
        aria-label={t("language")}
        className="absolute right-4 z-20 flex items-center gap-0.5 rounded-full border p-0.5 shadow-sm backdrop-blur-md"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          borderColor: APP_BORDER,
          background: "rgba(255,255,255,0.06)",
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
            <span className="block" style={{ color: textMain }}>
              {t("welcome_headline_l1")}
            </span>
            <span className="mt-0.5 block">
              <span style={{ color: textMain }}>{t("welcome_headline_l2_prefix")}</span>
              <span style={{ color: BRAND_BG }}>{t("welcome_headline_l2_accent")}</span>
            </span>
          </p>

          <div className="mt-3 w-full max-w-[min(100%,22rem)] sm:mt-3.5">
            <SportIconRow stroke={sportIconStroke} />
          </div>

          <div className="mt-5 flex w-full max-w-[min(100%,22rem)] flex-col gap-2.5 sm:mt-5">
            <button
              type="button"
              onClick={goCommencer}
              disabled={!navigationReady || !!oauthLoading}
              className="w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                backgroundColor: BRAND_BG,
                color: TEXT_ON_BRAND,
                boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
              }}
            >
              {t("welcome_cta_start")}
            </button>
            <button
              type="button"
              onClick={handleAppleSoon}
              disabled={!navigationReady || !!oauthLoading}
              className="w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                backgroundColor: "#fafafa",
                color: "#0a0a0a",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              {t("continue_with_apple")}
            </button>
            {appleNotice ? (
              <p
                role="status"
                aria-live="polite"
                className="-mt-1 text-center text-[13px] font-semibold leading-snug"
                style={{ color: textSoft }}
              >
                {t("welcome_apple_soon")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={!navigationReady || !!oauthLoading}
              className="w-full rounded-2xl border py-3.5 text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                borderColor: "rgba(255,255,255,0.14)",
                background: "rgba(12,12,16,0.75)",
                color: textMain,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              {oauthLoading === "google" ? t("loading") : t("continue_with_google")}
            </button>
            <button
              type="button"
              onClick={goEmailAuth}
              disabled={!navigationReady || !!oauthLoading}
              className="w-full rounded-2xl border-2 py-3.5 text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              style={{
                borderColor: "rgba(255,255,255,0.9)",
                background: "transparent",
                color: textMain,
              }}
            >
              {t("continue_with_email")}
            </button>
            {oauthBanner ? (
              <p
                role="alert"
                className="text-center text-[13px] font-medium leading-snug"
                style={{ color: "#fca5a5" }}
              >
                {oauthBanner}
              </p>
            ) : null}
          </div>

          <p
            className="mt-2.5 max-w-md px-0.5 text-center text-[11px] leading-relaxed sm:text-xs"
            style={{ color: "rgba(161,161,170,0.96)" }}
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
