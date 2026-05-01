import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  IconHeartFilled,
  IconHeartOutline,
  IconPass,
} from "./ui/Icon";
import { useTranslation } from "../i18n/useTranslation";

export type DiscoverActionBarProps = {
  canUndo?: boolean;
  isBetaTester?: boolean;
  isOnline?: boolean;
  onPass?: () => void;
  onLike?: () => void;
  onUndo?: () => void;
  /** Réservé — branche plus tard sans casser les appels Discover. */
  onMessage?: () => void;
};

/** Bande pass / proposer / like ; styles alignés sur l’ancien bloc DiscoverSwipeCard. */
export function DiscoverActionBar(props: DiscoverActionBarProps) {
  const { t } = useTranslation();
  const { canUndo = false, isBetaTester = false, isOnline = false, onPass, onLike, onUndo } = props;
  void props.onMessage;
  const undoLabel = t("discover_undo_action");

  return (
    <>
      {isBetaTester || isOnline ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5 text-[10px] text-app-muted">
          {isOnline ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-200/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {t("active")}
            </span>
          ) : null}
          {isBetaTester ? (
            <span className="rounded-full border border-app-border px-2 py-0.5 font-medium">Beta</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-stretch gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => onPass?.()}
          className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium text-app-muted transition hover:bg-app-border hover:text-app-muted"
          aria-label={t("pass")}
        >
          <IconPass size={20} />
          <span>{t("pass")}</span>
        </button>
        <button
          type="button"
          onClick={() => void onLike?.()}
          className="min-h-[52px] min-w-0 flex-1 rounded-2xl px-2 py-3 text-[15px] font-bold leading-tight shadow-md transition hover:opacity-95 active:scale-[0.99] sm:text-base"
          style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          {t("propose_activity")}
        </button>
        <button
          type="button"
          onClick={() => void onLike?.()}
          className="group flex w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-app-border bg-app-card py-2 text-[11px] font-semibold text-app-text shadow-sm transition hover:bg-app-border"
          aria-label={t("like")}
        >
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <IconHeartOutline
              size={20}
              color="#FF1E2D"
              className="absolute transition-opacity duration-150 ease-out group-active:opacity-0"
            />
            <IconHeartFilled
              size={20}
              color="#FF1E2D"
              className="absolute opacity-0 transition-opacity duration-150 ease-out group-active:opacity-100"
            />
          </span>
          <span>{t("like")}</span>
        </button>
      </div>
      {canUndo ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              void onUndo?.();
            }}
            className="text-[11px] font-semibold underline decoration-app-border underline-offset-2 transition text-app-muted hover:text-app-text"
          >
            ↩️ {undoLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
