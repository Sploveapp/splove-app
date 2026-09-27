import { useNavigate } from "react-router-dom";
import { BRAND_BG } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";

const SUPPORT_EMAIL = "contact@sploveapp.com";

export default function Assistance() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const title = "Assistance SPLove";
  const intro =
    language === "fr"
      ? "Pour toute question sur ton compte, l’application ou une rencontre, écris-nous. Nous te répondons par e\u2011mail."
      : "For any question about your account, the app, or a meetup, write to us. We reply by email.";

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <header
        className="sticky top-0 z-20 border-b border-app-border/30 bg-app-bg/95 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/auth"))}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-app-border bg-app-bg/60 px-3 py-2 text-sm font-semibold text-app-text hover:bg-app-border"
            aria-label={t("back")}
          >
            ← {t("back")}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4">
        <div className="rounded-2xl border border-app-border bg-app-card/70 p-4 sm:p-6">
          <h1 className="text-lg font-bold">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-app-text/90">{intro}</p>
          <p className="mt-5 text-sm leading-relaxed">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{
                color: BRAND_BG,
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
