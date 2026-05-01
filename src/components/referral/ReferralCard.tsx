import { useTranslation } from "../../i18n/useTranslation";

export type ReferralCardProps = {
  variant?: "A" | "B" | "C";
  onInvite: () => void;
};

const COPY_AB: Record<"A" | "B", { title: string; subtitle: string; reward: string; cta: string }> = {
  A: {
    title: "Plus de profils réels autour de toi",
    subtitle: "Accès bêta gratuit",
    reward: "3 retours offerts",
    cta: "Inviter maintenant",
  },
  B: {
    title: "Ta zone est calme...",
    subtitle: "Plus de profils réels autour de toi",
    reward: "Boost offert",
    cta: "Relancer maintenant",
  },
};

export default function ReferralCard({ variant = "A", onInvite }: ReferralCardProps) {
  const { t } = useTranslation();

  if (variant === "C") {
    return (
      <div className="w-full rounded-2xl border border-[#FF1E2D]/35 bg-[#12121a] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.04] sm:p-5">
        <p className="text-[15px] font-bold leading-snug tracking-tight text-[#F5F5F7] sm:text-base">
          {t("discover.referral_zone_title")}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{t("discover.referral_zone_subtitle")}</p>
        <button
          type="button"
          onClick={onInvite}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3 text-[14px] font-bold text-white shadow-lg shadow-[#FF1E2D]/20 transition hover:opacity-95 active:scale-[0.99]"
        >
          {t("discover.referral_zone_card_cta")}
        </button>
      </div>
    );
  }

  const v = variant === "B" ? COPY_AB.B : COPY_AB.A;

  return (
    <div className="w-full rounded-2xl border border-[#FF1E2D]/35 bg-[#12121a] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.04] sm:p-5">
      <p className="text-[15px] font-bold leading-snug tracking-tight text-[#F5F5F7] sm:text-base">{v.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{v.subtitle}</p>
      <p className="mt-3 text-[12px] font-semibold text-[#FF6B8A]">{v.reward}</p>
      <button
        type="button"
        onClick={onInvite}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3 text-[14px] font-bold text-white shadow-lg shadow-[#FF1E2D]/20 transition hover:opacity-95 active:scale-[0.99]"
      >
        {v.cta}
      </button>
    </div>
  );
}
