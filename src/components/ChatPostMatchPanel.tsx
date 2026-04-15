import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  COPY_BANNER_48H,
  COPY_BANNER_PROPOSED,
  COPY_MATCH_DORMANT,
  formatMatchWindowRemaining,
  type ActivityProductState,
} from "../lib/chatActivity";

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
  extendLabel = "Prolonger de 24h",
  hideCardProposeButton = false,
  onRelanceWindow,
  relanceBusy = false,
  onActivityBannerClick,
}: Props) {
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
          <p className="text-[13px] font-semibold leading-snug text-emerald-100/90">{COPY_BANNER_PROPOSED}</p>
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
        <p className="text-[13px] font-medium leading-snug text-amber-100">{COPY_MATCH_DORMANT}</p>
        {onRelanceWindow ? (
          <button
            type="button"
            disabled={relanceBusy}
            onClick={onRelanceWindow}
            className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold shadow-sm transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {relanceBusy ? "…" : "Relancer la rencontre"}
          </button>
        ) : null}
        {!hideCardProposeButton && (
          <button
            type="button"
            disabled={proposeDisabled}
            onClick={onProposeClick}
            className="mt-2 w-full rounded-xl border border-amber-500/35 bg-app-card py-2 text-[13px] font-semibold text-amber-100 hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proposer un moment
          </button>
        )}
      </div>
    );
  }

  /* Fenêtre active : pression douce + décompte. */
  return (
    <div className="mb-3 space-y-3">
      <div className="rounded-2xl border border-app-border bg-app-card px-4 py-3 shadow-sm ring-1 ring-white/[0.06]">
        <p className="text-center text-[13px] font-medium leading-relaxed text-app-text">{COPY_BANNER_48H}</p>
        {remainingMs != null && remainingMs > 0 ? (
          <p className="mt-2 text-center text-[12px] font-normal leading-snug text-app-muted">
            {formatMatchWindowRemaining(remainingMs)}
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
            Proposer un moment
          </button>
        )}
        {canExtendWindow && onExtendWindow && (
          <button
            type="button"
            onClick={onExtendWindow}
            className="mt-2 w-full rounded-xl border border-app-border bg-app-card py-2 text-[13px] font-semibold text-[#FF1E2D] hover:bg-app-border"
          >
            {extendLabel}
          </button>
        )}
      </div>
    </div>
  );
}
