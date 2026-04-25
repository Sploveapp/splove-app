import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  onActivate: () => void;
  onStayFree: () => void;
};

export function PriorityProposalUpsell({ onActivate, onStayFree }: Props) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-app-border bg-app-card px-4 py-4 shadow-sm">
      <h3 className="text-sm font-semibold text-app-text">{t("priority_upsell_title")}</h3>
      <p className="mt-1 text-sm text-app-muted">{t("priority_upsell_body")}</p>
      <ul className="mt-2 space-y-1 text-[13px] text-app-text">
        <li>— {t("priority_upsell_li1")}</li>
        <li>— {t("priority_upsell_li2")}</li>
        <li>— {t("priority_upsell_li3")}</li>
      </ul>
      <button
        type="button"
        onClick={onActivate}
        className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
        style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        {t("priority_upsell_cta")}
      </button>
      <button
        type="button"
        onClick={onStayFree}
        className="mt-2 w-full rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-medium text-app-text"
      >
        {t("priority_upsell_stay")}
      </button>
    </section>
  );
}
