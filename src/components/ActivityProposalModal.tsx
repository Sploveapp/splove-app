import { useEffect, useState } from "react";
import {
  type ActivityPayload,
  formatActivityProposalNote,
} from "../lib/chatActivity";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { SAFETY_CONTENT_REFUSAL } from "../constants/copy";
import { messageContainsDisallowedContent } from "../lib/contentModeration";

type Props = {
  open: boolean;
  onClose: () => void;
  sharedSports: string[];
  onSubmit: (payload: ActivityPayload) => Promise<void>;
  titleOverride?: string;
  descriptionOverride?: string;
  submitLabel?: string;
  initialSport?: string;
  initialPlace?: string;
  initialScheduledAt?: string;
  suggestedSlots?: string[];
  /** Contre-proposition : retour vers la vue précédente sans envoi ni changement de statut. */
  onBack?: () => void;
};

const QUICK_NOTE_CHIPS = ["Ça te dit ?", "Partant(e) ?", "On y va ?", "Pourquoi pas 🙂"] as const;

export function ActivityProposalModal({
  open,
  sharedSports,
  onClose,
  onSubmit,
  titleOverride,
  descriptionOverride,
  submitLabel,
  initialSport,
  initialPlace,
  initialScheduledAt,
  suggestedSlots = [],
  onBack,
}: Props) {
  const firstSport = sharedSports[0] ?? "";
  const [sport, setSport] = useState(firstSport);
  const [sportOther, setSportOther] = useState("");
  const [place, setPlace] = useState("");
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  /** Ligne courte choisie par puce ou saisie — composée dans formatActivityProposalNote. */
  const [noteText, setNoteText] = useState("");
  const [showCustomNote, setShowCustomNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharedKey = sharedSports.join("\u0001");

  useEffect(() => {
    if (!open) return;
    const prefSport = (initialSport ?? "").trim();
    const isSharedSport = prefSport.length > 0 && sharedSports.includes(prefSport);
    const initial = isSharedSport ? prefSport : sharedSports.length > 0 ? sharedSports[0]! : "";
    setSport(initial);
    setSportOther(isSharedSport ? "" : prefSport);
    setPlace((initialPlace ?? "").trim());
    if (initialScheduledAt) {
      const d = new Date(initialScheduledAt);
      if (!Number.isNaN(d.getTime())) {
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
        setScheduledAtLocal(local.toISOString().slice(0, 16));
      } else {
        setScheduledAtLocal("");
      }
    } else {
      const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
      fallback.setHours(18, 0, 0, 0);
      const local = new Date(fallback.getTime() - fallback.getTimezoneOffset() * 60_000);
      setScheduledAtLocal(local.toISOString().slice(0, 16));
    }
    setNoteText("");
    setShowCustomNote(false);
    setError(null);
    setSending(false);
  }, [open, sharedKey, initialSport, initialPlace, initialScheduledAt]);

  if (!open) return null;

  const resolvedSport =
    sharedSports.length === 0
      ? sportOther.trim()
      : sport === "__other__"
        ? sportOther.trim()
        : sport.trim();
  const canSubmit = Boolean(resolvedSport && scheduledAtLocal.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedSport) {
      setError("Indiquez un sport ou une activité.");
      return;
    }
    const fullMessage = formatActivityProposalNote({
      sport: resolvedSport,
      when: "other",
      place: place.trim(),
      userLine: noteText,
    });
    const scheduledAtDate = new Date(scheduledAtLocal);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      setError("Choisissez une date et une heure valides.");
      return;
    }
    const scheduledAtIso = scheduledAtDate.toISOString();
    const pieces = [place.trim(), noteText.trim(), sportOther.trim(), resolvedSport];
    for (const p of pieces) {
      if (p && messageContainsDisallowedContent(p)) {
        setError(SAFETY_CONTENT_REFUSAL);
        return;
      }
    }
    if (messageContainsDisallowedContent(fullMessage)) {
      setError(SAFETY_CONTENT_REFUSAL);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSubmit({
        sport: resolvedSport,
        when: "other",
        place: place.trim(),
        message: fullMessage,
        scheduledAt: scheduledAtIso,
      });
      onClose();
    } catch (err) {
      console.error("[ActivityProposalModal] submit failed:", err);
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 px-3 pb-0 pt-10 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mb-safe max-h-[min(92vh,640px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-app-card shadow-2xl ring-1 ring-app-border/80 sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-app-border bg-app-card/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-app-muted hover:bg-app-border hover:text-app-text"
              >
                Retour
              </button>
            ) : null}
            <h2 id="activity-modal-title" className="min-w-0 truncate text-base font-semibold tracking-tight text-app-text">
              {titleOverride ?? "Programmer une activité"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-app-muted hover:bg-app-border hover:text-app-text"
          >
            Fermer
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-[13px] leading-relaxed text-app-muted">
            {descriptionOverride ??
              "Propose un sport, un moment et un lieu. Vous pourrez ajuster les détails ensemble dans le chat."}
          </p>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-app-muted">
              Sport
            </label>
            {sharedSports.length > 0 ? (
              <select
                value={sharedSports.includes(sport) ? sport : "__other__"}
                onChange={(e) => setSport(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
              >
                {sharedSports.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="__other__">Autre…</option>
              </select>
            ) : (
              <input
  value={sportOther}
  onChange={(e) => setSportOther(e.target.value)}
  placeholder="Ex. running, tennis, piscine…"
  className="w-full rounded-xl border border-app-border bg-white px-3 py-3 text-[15px] text-black outline-none placeholder:text-gray-400 caret-black"
  style={{ color: "#000000", WebkitTextFillColor: "#000000" }}
/>
            )}
            {sport === "__other__" && sharedSports.length > 0 && (
              <input
              value={sportOther}
              onChange={(e) => setSportOther(e.target.value)}
              placeholder="Précisez l’activité"
              className="mt-2 w-full rounded-xl border border-app-border bg-white px-3 py-3 text-[15px] text-black outline-none placeholder:text-gray-400 caret-black"
              style={{ color: "#000000", WebkitTextFillColor: "#000000" }}
            />
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-app-muted">
              Date / heure
            </label>
            {suggestedSlots.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {suggestedSlots.slice(0, 2).map((iso) => {
                  const d = new Date(iso);
                  if (Number.isNaN(d.getTime())) return null;
                  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
                    .toISOString()
                    .slice(0, 16);
                  const label = d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setScheduledAtLocal(local)}
                      className="rounded-full border border-app-border bg-app-bg/80 px-3 py-1.5 text-[12px] font-medium text-app-text hover:bg-app-border"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <input
              type="datetime-local"
              value={scheduledAtLocal}
              onChange={(e) => setScheduledAtLocal(e.target.value)}
              className="w-full rounded-xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-app-muted">
              Lieu <span className="font-normal normal-case">(facultatif)</span>
            </label>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Ex. Cassis, Skatepark du Prado, bord de mer…"
              className="w-full rounded-xl border border-app-border bg-app-card px-3 py-3 text-[15px] text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
            />
          </div>

          <div className="border-t border-app-border/80 pt-4">
            <span className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-app-muted/90">
              Message <span className="font-normal normal-case">(optionnel)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_NOTE_CHIPS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setNoteText(q);
                    setShowCustomNote(false);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                    noteText === q
                      ? "border-[#FF1E2D]/40 bg-[#FF1E2D]/8 text-[#FF1E2D]"
                      : "border-app-border bg-app-bg/80 text-app-text hover:bg-app-border"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCustomNote((v) => !v)}
              className="mt-2 text-[13px] font-medium text-[#FF1E2D] underline-offset-2 hover:underline"
            >
              {showCustomNote ? "Masquer la saisie libre" : "Personnaliser le message"}
            </button>
            {showCustomNote && (
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                placeholder="Votre phrase…"
                className="mt-2 w-full resize-none rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-[15px] leading-relaxed text-app-text outline-none focus:ring-2 focus:ring-[#FF1E2D]/25"
              />
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={sending || !canSubmit}
              className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold shadow-sm disabled:opacity-60"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {sending ? "Envoi…" : submitLabel ?? "Envoyer la proposition"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-app-border bg-app-card px-4 py-2.5 text-[14px] font-medium text-app-muted hover:bg-app-border"
            >
              Annuler
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
