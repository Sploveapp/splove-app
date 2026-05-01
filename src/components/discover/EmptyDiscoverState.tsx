import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import { useTranslation } from "../../i18n/useTranslation";

export type EmptyDiscoverStateProps = {
  onRefresh: () => void;
};

/** État vide lorsque plus aucun profil n’est disponible dans la pile Discover. */
export function EmptyDiscoverState({ onRefresh }: EmptyDiscoverStateProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-3xl border border-app-border bg-gradient-to-br from-app-card via-app-card to-zinc-900/95 px-5 py-10 text-center shadow-lg ring-1 ring-white/[0.06]"
      role="status"
    >
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/10 shadow-[0_0_28px_rgba(16,185,129,0.18)]"
        aria-hidden
      >
        <span className="text-2xl" aria-hidden>
          ◎
        </span>
      </div>
      <p className="mt-5 text-[1.05rem] font-bold leading-snug text-app-text">{t("discover.emptyAliveTitle")}</p>
      <p className="mx-auto mt-2 max-w-[22rem] text-sm leading-relaxed text-app-muted">
        {t("discover.emptyAliveText")}
      </p>
      <button
        type="button"
        onClick={() => onRefresh()}
        className="mx-auto mt-6 block w-full max-w-[17rem] rounded-2xl px-4 py-3.5 text-[15px] font-bold shadow-md transition hover:opacity-95 active:scale-[0.99]"
        style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        {t("discover.emptyAliveButton")}
      </button>
      <p className="mx-auto mt-4 max-w-[22rem] text-[12px] leading-relaxed text-app-muted">
        {t("discover.emptyAliveTip")}
      </p>
    </div>
  );
}
