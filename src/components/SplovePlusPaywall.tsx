import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type Props = {
  onActivate: () => void;
  onContinueFree: () => void;
};

export function SplovePlusPaywall({ onActivate, onContinueFree }: Props) {
  return (
    <section
      className="rounded-3xl border border-app-border bg-app-card px-5 py-6 shadow-sm ring-1 ring-app-border"
      aria-label="Paywall SPLove+"
    >
      <h1 className="text-xl font-bold leading-snug tracking-tight text-app-text">
        Passe du match au réel, sans attendre.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-app-muted">
        Propose une activité. On te rend visible au bon moment, au bon endroit.
      </p>

      <ul className="mt-4 space-y-2 text-sm text-app-text">
        <li>Ta proposition passe en priorité</li>
        <li>Tu rencontres plus vite, pour de vrai</li>
      </ul>

      <div className="mt-6 rounded-xl bg-app-bg/80 px-3 py-2.5 text-center ring-1 ring-app-border/80">
        <p className="text-[10px] font-medium uppercase tracking-wide text-app-muted">Prix</p>
        <p className="mt-0.5 text-lg font-semibold text-app-text/95">5,99 EUR / mois</p>
      </div>

      <button
        type="button"
        onClick={onActivate}
        className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold shadow-sm"
        style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        Passer au réel maintenant
      </button>
      <button
        type="button"
        onClick={onContinueFree}
        className="mt-2 w-full rounded-2xl border border-app-border bg-app-card py-3 text-sm font-medium text-app-text hover:bg-app-border"
      >
        Continuer en version gratuite
      </button>

      <p className="mt-4 text-center text-xs text-app-muted">
        Pas plus de matchs. Plus de vraies rencontres.
      </p>
    </section>
  );
}
