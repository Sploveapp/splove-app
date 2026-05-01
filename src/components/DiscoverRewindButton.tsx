import type { ButtonHTMLAttributes } from "react";

const REWIND_BG = "#1F1F24";
const REWIND_ACCENT = "#D1003F";

export type DiscoverRewindButtonProps = {
  onRewind: () => void;
  /** Seulement pendant chargement ; le parent gère le paywall vs rewind actif. */
  disabled: boolean;
  busy: boolean;
  /** Libellé court à côté de ↩ (ex. Undo / Annuler). */
  actionLabel?: string | null;
  /** Légende optionnelle (crédits, accès monétisé, etc.) */
  hint?: string | null;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">;

/**
 * Fixed bottom-center rewind control — dark chip + raspberry accent (no layout redesign).
 */
export function DiscoverRewindButton({
  onRewind,
  disabled,
  busy,
  actionLabel,
  hint,
  "aria-label": ariaLabel,
}: DiscoverRewindButtonProps) {
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end gap-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {hint ? (
        <p className="pointer-events-none max-w-[16rem] px-2 text-center text-[10px] font-medium leading-tight text-app-muted/95">
          {hint}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRewind}
        disabled={disabled || busy}
        aria-label={ariaLabel}
        className={`pointer-events-auto flex h-12 items-center justify-center gap-2 rounded-full font-semibold leading-none shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
          actionLabel
            ? "min-w-[min(92vw,20rem)] max-w-[20rem] px-5 text-xl"
            : "w-12 text-xl"
        }`}
        style={{
          backgroundColor: REWIND_BG,
          color: REWIND_ACCENT,
          boxShadow: `0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(209,0,63,0.32)`,
        }}
      >
        {busy ? (
          <span className="text-sm text-white/80">…</span>
        ) : actionLabel ? (
          <>
            <span aria-hidden>↩️</span>
            <span className="text-[13px] font-bold tracking-tight">{actionLabel}</span>
          </>
        ) : (
          <span aria-hidden>↩</span>
        )}
      </button>
    </div>
  );
}
