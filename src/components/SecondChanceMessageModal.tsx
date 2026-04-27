import { useCallback, useEffect, useState } from "react";
import { isSecondChanceMessageTextValid, SECOND_CHANCE_MAX_LEN } from "../lib/secondChanceMessage";

type SecondChanceMessageModalProps = {
  open: boolean;
  recipientFirstName: string;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
  title: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
  errInvalid: string;
  errGeneric: string;
  hintNoLinks: string;
  creditHint: string;
};

export function SecondChanceMessageModal({
  open,
  recipientFirstName,
  onClose,
  onSubmit,
  title,
  placeholder,
  submitLabel,
  cancelLabel,
  errInvalid,
  errGeneric,
  hintNoLinks,
  creditHint,
}: SecondChanceMessageModalProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setValue("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const t = value.trim();
    if (!isSecondChanceMessageTextValid(t)) {
      setError(errInvalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : errGeneric);
    } finally {
      setBusy(false);
    }
  }, [errGeneric, errInvalid, onSubmit, value]);

  if (!open) return null;

  const len = value.length;
  const valid = isSecondChanceMessageTextValid(value.trim());

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/60 px-3 pb-0 pt-10 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="second-chance-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mb-safe w-full max-w-md rounded-t-3xl border border-app-border bg-app-card p-5 shadow-2xl sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="second-chance-modal-title" className="text-center text-base font-semibold text-app-text">
          {title}
        </h2>
        <p className="mt-1 text-center text-[12px] text-app-muted">
          {recipientFirstName}
        </p>
        <p className="mt-2 text-center text-[11px] text-app-muted/90">{hintNoLinks}</p>
        <p className="mt-1 text-center text-[11px] text-app-muted/80">{creditHint}</p>
        <textarea
          className="mt-4 w-full min-h-[120px] resize-y rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-[15px] text-app-text placeholder:text-app-muted/70 focus:outline-none focus:ring-2 focus:ring-app-accent/40"
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= SECOND_CHANCE_MAX_LEN) {
              setValue(e.target.value);
            }
            setError(null);
          }}
          placeholder={placeholder}
          maxLength={SECOND_CHANCE_MAX_LEN}
          autoFocus
        />
        <div className="mt-1 flex justify-end text-[11px] text-app-muted">
          <span>
            {len}/{SECOND_CHANCE_MAX_LEN}
          </span>
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-950/30 px-2 py-1.5 text-[12px] text-amber-100/95">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-app-border py-2.5 text-sm font-medium text-app-text"
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !valid}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "#1F1F24" }}
          >
            {busy ? "…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
