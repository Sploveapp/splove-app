import { X } from "lucide-react";
import sploveMark from "../../assets/welcome/splove-mark.png";
import type { MatchIntroVariant } from "../../lib/matchIntroVariant";
import { matchIntroPrimaryOpensActivity, matchIntroShowsSecondary } from "../../lib/matchIntroVariant";
import { useTranslation } from "../../i18n/useTranslation";

export type MatchIntroModalProps = {
  open: boolean;
  variant: MatchIntroVariant;
  onClose: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
};

function copyKeysForVariant(variant: MatchIntroVariant): {
  title: string;
  body: string;
  subtitle: string;
  primary: string;
  secondary: string;
} {
  switch (variant) {
    case "hetero_femme":
      return {
        title: "match_intro.hetero_femme.title",
        body: "match_intro.hetero_femme.body",
        subtitle: "match_intro.hetero_femme.subtitle",
        primary: "match_intro.hetero_femme.primary",
        secondary: "match_intro.continue_discover",
      };
    case "hetero_homme":
      return {
        title: "match_intro.hetero_homme.title",
        body: "match_intro.hetero_homme.body",
        subtitle: "match_intro.hetero_homme.subtitle",
        primary: "match_intro.hetero_homme.primary",
        secondary: "match_intro.continue_discover",
      };
    case "same_gender_start":
      return {
        title: "match_intro.same_start.title",
        body: "match_intro.same_start.body",
        subtitle: "match_intro.same_start.subtitle",
        primary: "match_intro.same_start.primary",
        secondary: "match_intro.continue_discover",
      };
    case "same_gender_wait":
      return {
        title: "match_intro.same_wait.title",
        body: "match_intro.same_wait.body",
        subtitle: "match_intro.same_wait.subtitle",
        primary: "match_intro.same_wait.primary",
        secondary: "match_intro.continue_discover",
      };
    default:
      return {
        title: "match_intro.generic.title",
        body: "match_intro.generic.body",
        subtitle: "match_intro.generic.subtitle",
        primary: "match_intro.generic.primary",
        secondary: "match_intro.continue_discover",
      };
  }
}

export function MatchIntroModal({
  open,
  variant,
  onClose,
  onPrimary,
  onSecondary,
}: MatchIntroModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  const keys = copyKeysForVariant(variant);
  const showSecondary = matchIntroShowsSecondary(variant);
  const primaryIsActivity = matchIntroPrimaryOpensActivity(variant);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-intro-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div className="relative w-full max-w-md animate-[fadeIn_0.28s_ease-out] rounded-t-[26px] border border-white/[0.1] bg-app-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_48px_rgba(0,0,0,0.45)] sm:rounded-2xl sm:pb-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition hover:bg-white/[0.06] hover:text-app-text"
          aria-label={t("close")}
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>

        <div className="mb-4 flex justify-center pt-1">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <img
              src={sploveMark}
              alt=""
              className="absolute h-12 w-12 object-contain opacity-[0.35]"
              aria-hidden
            />
            <span className="text-2xl" aria-hidden>
              ❤️
            </span>
          </div>
        </div>

        <h2 id="match-intro-title" className="text-center text-lg font-bold tracking-tight text-white">
          {t(keys.title)}
        </h2>
        <p className="mt-2 text-center text-[15px] leading-snug text-app-text/95">{t(keys.body)}</p>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-app-muted">{t(keys.subtitle)}</p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPrimary}
            className="w-full rounded-xl bg-[#FF1E2D] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(255,30,45,0.28)] transition active:scale-[0.99]"
          >
            {t(keys.primary)}
          </button>
          {showSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-[14px] font-medium text-app-muted transition hover:bg-white/[0.04] hover:text-app-text"
            >
              {t(keys.secondary)}
            </button>
          ) : null}
        </div>

        {primaryIsActivity ? (
          <p className="mt-3 text-center text-[11px] leading-snug text-app-muted/80">
            {t("match_intro.activity_hint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
