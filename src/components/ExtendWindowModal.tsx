import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
};

export function ExtendWindowModal({ open, onClose, onConfirm, onSkip }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-app-card p-5 shadow-2xl ring-1 ring-app-border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-app-text">
          Donner un peu plus de temps a cette rencontre
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Prolongez la fenetre de proposition de 24h supplementaires.
        </p>
        <p className="mt-3 text-xs text-app-muted">
          Utile si le timing n’etait pas ideal, sans laisser retomber l’elan.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-4 w-full rounded-2xl py-3 text-sm font-semibold"
          style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          Prolonger avec Splove+
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 w-full rounded-2xl border border-app-border bg-app-card py-3 text-sm font-medium text-app-text"
        >
          Laisser expirer
        </button>
      </div>
    </div>
  );
}
