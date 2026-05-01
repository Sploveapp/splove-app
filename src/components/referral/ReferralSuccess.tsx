import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useTranslation } from "../../i18n/useTranslation";
import { countReferralsRowsByReferrer } from "../../services/referral.service";

export type ReferralSuccessProps = {
  /** Incrémenté après chaque partage enregistré pour recharger le compteur. */
  reloadNonce: number;
  inviteAgainBusy: boolean;
  onInviteAgain: () => void | Promise<void>;
  onViewArea: () => void;
};

export default function ReferralSuccess({
  reloadNonce,
  inviteAgainBusy,
  onInviteAgain,
  onViewArea,
}: ReferralSuccessProps) {
  const { t } = useTranslation();
  const [invitesCount, setInvitesCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        if (!cancelled) setInvitesCount(0);
        return;
      }
      const n = await countReferralsRowsByReferrer(user.id);
      if (!cancelled) setInvitesCount(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const displayed = invitesCount ?? 0;

  return (
    <div className="mt-1 space-y-4 pb-1">
      <h2 id="referral-success-title" className="text-lg font-bold leading-snug text-[#F5F5F7] sm:text-xl">
        {t("referral_success_title")}
      </h2>
      <p className="text-[14px] leading-relaxed text-white/72">{t("referral_success_subtitle")}</p>
      <p className="text-[14px] font-semibold leading-relaxed text-[#FF8FA3]/95">{t("referral_success_progress")}</p>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-3">
        <p className="text-[13px] font-semibold text-[#F5F5F7]">{t("referral_success_impact", { n: displayed })}</p>
      </div>

      <ul className="space-y-2 text-[13px] leading-relaxed text-white/72">
        <li>{t("referral_success_info_1")}</li>
        <li>{t("referral_success_info_2")}</li>
      </ul>

      <div className="flex flex-col gap-2.5 pt-1">
        <button
          type="button"
          disabled={inviteAgainBusy}
          onClick={() => void onInviteAgain()}
          className="w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#FF1E2D]/18 transition hover:opacity-95 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
        >
          {t("referral_success_cta_invite")}
        </button>
        <button
          type="button"
          disabled={inviteAgainBusy}
          onClick={onViewArea}
          className="w-full rounded-xl border border-white/12 bg-transparent py-3 text-[14px] font-semibold text-white/90 transition hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-50"
        >
          {t("referral_success_cta_zone")}
        </button>
      </div>
    </div>
  );
}
