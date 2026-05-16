import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import { useTranslation } from "../../i18n/useTranslation";

type Props = {
  detailLine: string;
  onViewMeetup: () => void;
};

/** Carte système unique quand le rendez-vous est confirmé — le fil reste centré sur les messages. */
export function ChatConfirmedActivityCard({ detailLine, onViewMeetup }: Props) {
  const { t } = useTranslation();

  return (
    <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 shadow-sm ring-1 ring-emerald-400/10">
      <p className="text-[13px] font-semibold leading-snug text-emerald-50">
        <span aria-hidden className="mr-1.5">
          🎯
        </span>
        {t("chat_confirmed_activity_title")}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-emerald-100/80">{detailLine}</p>
      <button
        type="button"
        onClick={onViewMeetup}
        className="mt-2.5 w-full rounded-xl py-2 text-[12px] font-semibold transition hover:opacity-95"
        style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        {t("chat_confirmed_view_meetup")}
      </button>
    </div>
  );
}
