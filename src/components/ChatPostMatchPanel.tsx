import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import type { ActivityProductState } from "../lib/chatActivity";

const HOURS_48_MS = 48 * 60 * 60 * 1000;

type Props = {
  productState: ActivityProductState;
  matchOpenedAt: number | null;
  windowExpiresAt?: number | null;
  nowTick: number;
  onProposeClick: () => void;
  proposeDisabled?: boolean;
  proposalStatusLabel?: string | null;
  canExtendWindow?: boolean;
  onExtendWindow?: () => void;
  extendLabel?: string;
  hideCardProposeButton?: boolean;
  /** Prolonge la fenêtre 48h côté serveur (match « endormi »). */
  onRelanceWindow?: () => void;
  relanceBusy?: boolean;
  /** Clic sur le bandeau « créneau proposé » (ouvre le détail côté parent). */
  onActivityBannerClick?: () => void;
};

function formatMatchWindowRemaining(
  t: (key: string, vars?: Record<string, string | number>) => string,
  ms: number,
): string {
  if (ms <= 0) return t("chat_match_window_expired");
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 24) return t("chat_match_window_day_left");
  if (h > 0) {
    return m > 0
      ? t("chat_match_window_h_m", { hours: String(h), mins: String(m) })
      : t("chat_match_window_h", { hours: String(h) });
  }
  if (m > 0) return t("chat_match_window_m", { mins: String(m) });
  return t("chat_match_window_tight");
}

export function ChatPostMatchPanel({
  productState,
  matchOpenedAt,
  windowExpiresAt = null,
  nowTick,
  onProposeClick,
  proposeDisabled = false,
  proposalStatusLabel = null,
  canExtendWindow = false,
  onExtendWindow,
  extendLabel,
  hideCardProposeButton = false,
  onRelanceWindow,
  relanceBusy = false,
  onActivityBannerClick,
}: Props) {
  const { t } = useTranslation();
  const extLabel = extendLabel ?? t("chat_extend_24h");
  const baseExpiresAt =
    windowExpiresAt ?? (matchOpenedAt != null ? matchOpenedAt + HOURS_48_MS : null);
  const remainingMs =
    baseExpiresAt != null ? Math.max(0, baseExpiresAt - nowTick) : null;
  const windowExpired = baseExpiresAt != null && nowTick >= baseExpiresAt;

  if (productState === "activity_proposed") {
    if (!onActivityBannerClick) return null;
    return (
      <div className="mb-3 space-y-3">
        <button
          type="button"
          onClick={() => onActivityBannerClick()}
          className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-950/35 px-4 py-3 text-center shadow-sm ring-1 ring-emerald-400/10 transition hover:bg-emerald-950/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/25"
        >
          <p className="text-[13px] font-semibold leading-snug text-emerald-100/90">
            {t("session_notice_active")}
          </p>
          {proposalStatusLabel ? (
            <p className="mt-1 text-[12px] font-medium text-emerald-200/75">{proposalStatusLabel}</p>
          ) : null}
        </button>
      </div>
    );
  }

  /* Fenêtre 48h écoulée sans proposition : doux, sans bloquer le chat. */
  if (windowExpired) {
    return (
      <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-center shadow-sm ring-1 ring-amber-500/15">
        <p className="text-[13px] font-medium leading-snug text-amber-100">{t("chat_dormant_match")}</p>
        {onRelanceWindow ? (
          <button
            type="button"
            disabled={relanceBusy}
            onClick={onRelanceWindow}
            className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold shadow-sm transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {relanceBusy ? "…" : t("chat_relance_meetup")}
          </button>
        ) : null}
        {!hideCardProposeButton && (
          <button
            type="button"
            disabled={proposeDisabled}
            onClick={onProposeClick}
            className="mt-2 w-full rounded-xl border border-amber-500/35 bg-app-card py-2 text-[13px] font-semibold text-amber-100 hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("chat_suggest_moment")}
          </button>
        )}
      </div>
    );
  }

  /* Fenêtre active : pression douce + décompte. */
  return (
    <div className="mb-3 space-y-3">
      <div className="rounded-2xl border border-app-border bg-app-card px-4 py-3 shadow-sm ring-1 ring-white/[0.06]">
        <p className="text-center text-[13px] font-medium leading-relaxed text-app-text">
          {t("chat_banner_48h")}
        </p>
        {remainingMs != null && remainingMs > 0 ? (
          <p className="mt-2 text-center text-[12px] font-normal leading-snug text-app-muted">
            {formatMatchWindowRemaining(t, remainingMs)}
          </p>
        ) : null}
        {proposalStatusLabel ? (
          <p className="mt-1 text-center text-[12px] font-medium text-app-muted">{proposalStatusLabel}</p>
        ) : null}
        {!hideCardProposeButton && (
          <button
            type="button"
            disabled={proposeDisabled}
            onClick={onProposeClick}
            className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {t("chat_suggest_moment")}
          </button>
        )}
        {canExtendWindow && onExtendWindow && (
          <button
            type="button"
            onClick={onExtendWindow}
            className="mt-2 w-full rounded-xl border border-app-border bg-app-card py-2 text-[13px] font-semibold text-[#FF1E2D] hover:bg-app-border"
          >
            {extLabel}
          </button>
        )}
      </div>
    </div>
  );
}
