import { useTranslation } from "../../i18n/useTranslation";

export type DiscoverLocalImpactCardProps = {
  invitesCount: number;
  successfulReferrals: number;
  boostCredits: number;
  loading?: boolean;
  onInviteClick: () => void;
};

export function DiscoverLocalImpactCard({
  invitesCount,
  successfulReferrals,
  boostCredits,
  loading,
  onInviteClick,
}: DiscoverLocalImpactCardProps) {
  const { t } = useTranslation();

  const showRedAccent = !loading && invitesCount > 0;
  const borderRing = showRedAccent
    ? "border-[#FF1E2D]/38 ring-1 ring-[#FF1E2D]/12"
    : "border-app-border ring-1 ring-white/[0.05]";

  const goalBelowThree = invitesCount < 3;
  const remaining = Math.max(0, 3 - invitesCount);

  return (
    <div
      className={`mx-auto mt-3 w-full max-w-[21rem] rounded-2xl border bg-app-card px-3 py-3 text-left shadow-sm ${borderRing}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-app-text">{t("discover.local_impact_title")}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-app-muted">{t("discover.local_impact_subtitle")}</p>

      {loading ? (
        <p className="mt-3 text-[12px] text-app-muted">…</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2 text-[12px] leading-snug text-app-text">
            <li className="flex gap-2">
              <span aria-hidden>🚀</span>
              <span>{t("discover.local_impact_row_invites", { n: invitesCount })}</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>👥</span>
              <span>{t("discover.local_impact_row_joined", { n: successfulReferrals })}</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>⚡</span>
              <span>{t("discover.local_impact_row_boosts", { n: boostCredits })}</span>
            </li>
          </ul>

          <p className="mt-3 text-[12px] font-medium leading-snug text-[#FF8FA3]/95">
            {goalBelowThree ? t("discover.local_impact_goal_more", { n: remaining }) : t("discover.local_impact_goal_active")}
          </p>
        </>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={onInviteClick}
        className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-2.5 text-[13px] font-bold text-white shadow-md shadow-[#FF1E2D]/18 transition hover:opacity-95 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
      >
        {t("discover.local_impact_cta")}
      </button>
    </div>
  );
}
