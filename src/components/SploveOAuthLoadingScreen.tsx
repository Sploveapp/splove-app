import { SploveSplashMark } from "./SploveSplashMark";
import { useTranslation } from "../i18n/useTranslation";

const FOOTER_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/**
 * Overlay plein écran pendant OAuth Google (Capacitor iOS/Android).
 * Fond noir, logo SPLove, message « Connexion sécurisée… » — sans logique boot splash.
 */
export function SploveOAuthLoadingScreen() {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col"
      style={{ backgroundColor: "#0B0B0F" }}
      role="status"
      aria-live="polite"
      aria-label={t("auth_google_oauth_overlay_title")}
    >
      <div className="relative flex flex-1 flex-col items-center justify-center px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 42%, rgba(255, 30, 45, 0.14) 0%, transparent 68%)",
          }}
        />
        <SploveSplashMark size={148} />
        <p
          style={{
            margin: "28px 0 0",
            fontSize: "17px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "rgba(255,255,255,0.94)",
            fontFamily: FOOTER_FONT,
            textAlign: "center",
          }}
        >
          {t("auth_google_oauth_overlay_title")}
        </p>
        <p
          style={{
            margin: "10px 0 0",
            maxWidth: 280,
            fontSize: "13px",
            fontWeight: 500,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.52)",
            fontFamily: FOOTER_FONT,
            textAlign: "center",
          }}
        >
          {t("auth_google_oauth_overlay_subtitle")}
        </p>
      </div>
      <footer
        className="pointer-events-none shrink-0 text-center"
        style={{
          paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px))",
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.72)",
            fontFamily: FOOTER_FONT,
          }}
        >
          SPLove
        </p>
      </footer>
    </div>
  );
}
