type DiscoverRewindPurchaseModalProps = {
  open: boolean;
  busy?: boolean;
  onBuy: () => void;
  onGoPlus: () => void;
  onClose: () => void;
};

export function DiscoverRewindPurchaseModal({
  open,
  busy = false,
  onBuy,
  onGoPlus,
  onClose,
}: DiscoverRewindPurchaseModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 px-3 pb-0 pt-10 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Ne rate pas une belle rencontre"
      onMouseDown={onClose}
    >
      <div
        className="mb-safe w-full max-w-md rounded-t-3xl border border-app-border bg-app-card p-4 shadow-2xl sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-bold text-app-text">Ne rate pas une belle rencontre</h2>
        <p className="mt-1 text-center text-sm text-app-muted">Tu peux revoir ce profil maintenant</p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="w-full rounded-2xl bg-[#D1003F] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "…" : "↩ Revoir le profil - 1,99€"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onGoPlus}
            className="w-full rounded-2xl border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text transition hover:bg-app-border disabled:opacity-60"
          >
            Passer a Splove+
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-2xl border border-app-border/70 bg-transparent px-4 py-3 text-sm font-medium text-app-muted transition hover:bg-app-border disabled:opacity-60"
          >
            Non merci
          </button>
        </div>
      </div>
    </div>
  );
}
