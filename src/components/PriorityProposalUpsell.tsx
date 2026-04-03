import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type Props = {
  onActivate: () => void;
  onStayFree: () => void;
};

export function PriorityProposalUpsell({ onActivate, onStayFree }: Props) {
  return (
    <section className="rounded-2xl border border-app-border bg-app-card px-4 py-4 shadow-sm">
      <h3 className="text-sm font-semibold text-app-text">Passe en priorite</h3>
      <p className="mt-1 text-sm text-app-muted">
        Ta proposition d’activite sera mise en avant pour augmenter les chances de rencontre reelle.
      </p>
      <ul className="mt-2 space-y-1 text-[13px] text-app-text">
        <li>- visible en premier</li>
        <li>- mieux mise en valeur</li>
        <li>- relance douce si besoin</li>
      </ul>
      <button
        type="button"
        onClick={onActivate}
        className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
        style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        Activer Splove+
      </button>
      <button
        type="button"
        onClick={onStayFree}
        className="mt-2 w-full rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-medium text-app-text"
      >
        Rester en version gratuite
      </button>
    </section>
  );
}
