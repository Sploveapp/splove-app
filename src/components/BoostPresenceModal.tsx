import { useState } from "react";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type Duration = 30 | 60;

type Props = {
  open: boolean;
  onClose: () => void;
  onActivate: (duration: Duration) => void;
};

export function BoostPresenceModal({ open, onClose, onActivate }: Props) {
  const [duration, setDuration] = useState<Duration>(30);

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
        <h2 className="text-base font-semibold text-app-text">Booster ma présence</h2>
        <p className="mt-1 text-sm text-app-muted">
          Sois visible en priorité autour de ton sport pendant un temps limité.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDuration(30)}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              duration === 30
                ? "border-[#FF1E2D] bg-[#FF1E2D] text-white"
                : "border-app-border bg-app-card text-app-text"
            }`}
          >
            30 min
          </button>
          <button
            type="button"
            onClick={() => setDuration(60)}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              duration === 60
                ? "border-[#FF1E2D] bg-[#FF1E2D] text-white"
                : "border-app-border bg-app-card text-app-text"
            }`}
          >
            1 h
          </button>
        </div>

        <p className="mt-3 text-xs text-app-muted">
          Idéal quand vous êtes disponible maintenant ou juste avant une session sport.
        </p>

        <button
          type="button"
          onClick={() => onActivate(duration)}
          className="mt-4 w-full rounded-2xl py-3 text-sm font-semibold"
          style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          Activer maintenant
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border border-app-border bg-app-card py-3 text-sm font-medium text-app-text"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
