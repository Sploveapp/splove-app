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
  /** Affiche le bouton compact « + Proposer » dans le bloc match. */
  showCompactPropose?: boolean;
  canExtendWindow?: boolean;
  onExtendWindow?: () => void;
  extendLabel?: string;
  onRelanceWindow?: () => void;
  relanceBusy?: boolean;
  onActivityBannerClick?: () => void;
};

export function ChatPostMatchPanel({
  productState,
  matchOpenedAt,
  windowExpiresAt = null,
  nowTick,
  onProposeClick,
  proposeDisabled = false,
  showCompactPropose = true,
  canExtendWindow = false,
  onExtendWindow,
  extendLabel,
  onRelanceWindow,
  relanceBusy = false,
  onActivityBannerClick,
}: Props) {
  const { t } = useTranslation();
  const extLabel = extendLabel ?? t("chat_extend_24h");
  const baseExpiresAt =
    windowExpiresAt ?? (matchOpenedAt != null ? matchOpenedAt + HOURS_48_MS : null);
  const windowExpired = baseExpiresAt != null && nowTick >= baseExpiresAt;

  if (productState === "activity_proposed") {
    if (!onActivityBannerClick) return null;
    return (
      <div className="mb-3 space-y-3">
        <button
          type="button"
          onClick={() => onActivityBannerClick()}
          className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-950/35 px-4 py-3 text-left shadow-sm ring-1 ring-emerald-400/10 transition hover:bg-emerald-950/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/25"
        >
          <p className="text-[13px] font-semibold leading-snug text-emerald-100/90">
            {t("session_notice_active")}
          </p>
        </button>
      </div>
    );
  }

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
        {canExtendWindow && onExtendWindow ? (
          <button
            type="button"
            onClick={onExtendWindow}
            className="mt-2 w-full rounded-xl border border-amber-500/35 bg-app-card py-2 text-[13px] font-semibold text-amber-100 hover:bg-app-border"
          >
            {extLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-3">
      {/* Bloc principal — match */}
      <div className="flex items-center gap-3 rounded-2xl border border-app-border/90 bg-app-card px-3.5 py-3 shadow-sm ring-1 ring-white/[0.05]">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FF3B3B]/45 text-[#FF3B3B]"
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20.2c-3-2.25-5.6-4.45-5.6-7.2A3.1 3.1 0 0 1 9.6 9.8c1 0 1.8.45 2.4 1.15.6-.7 1.4-1.15 2.4-1.15A3.1 3.1 0 0 1 17.6 13c0 2.75-2.6 4.95-5.6 7.2Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-app-text">{t("chat_matched_title")}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-app-muted">{t("chat_matched_subtitle")}</p>
        </div>
        {showCompactPropose ? (
          <button
            type="button"
            disabled={proposeDisabled}
            onClick={onProposeClick}
            className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {t("chat_propose_compact")}
          </button>
        ) : null}
      </div>

      {/* Bloc délai — une seule fois, sans compte à rebours redondant */}
      <div className="flex items-start gap-3 rounded-2xl border border-app-border/90 bg-app-card px-3.5 py-3 shadow-sm ring-1 ring-white/[0.05]">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FF3B3B]/45 text-[#FF3B3B]"
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 8v4.2l2.6 1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-app-text">{t("chat_first_steps_title")}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-app-muted">{t("chat_first_steps_body")}</p>
        </div>
      </div>
    </div>
  );
}
