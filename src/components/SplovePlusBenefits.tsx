import { PremiumBadge } from "./PremiumBadge";

type Props = {
  onBoost: () => void;
  onSeeSuggestions: () => void;
};

export function SplovePlusBenefits({ onBoost, onSeeSuggestions }: Props) {
  return (
    <section className="rounded-3xl border border-app-border bg-app-card px-5 py-5 shadow-sm">
      <div className="mb-3 inline-flex">
        <PremiumBadge />
      </div>
      <h2 className="text-lg font-semibold text-app-text">Vos avantages SPLove+</h2>
      <ul className="mt-3 space-y-2 text-sm text-app-text">
        <li>- Boost local disponible</li>
        <li>- Propositions prioritaires activees</li>
        <li>- Suggestions premium disponibles</li>
        <li>- Prolongation 24h incluse</li>
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onBoost}
          className="rounded-2xl border border-app-border bg-app-card px-3 py-2.5 text-sm font-semibold text-app-text"
        >
          Booster ma presence
        </button>
        <button
          type="button"
          onClick={onSeeSuggestions}
          className="rounded-2xl border border-app-border bg-app-card px-3 py-2.5 text-sm font-semibold text-app-text"
        >
          Voir mes suggestions
        </button>
      </div>
    </section>
  );
}
