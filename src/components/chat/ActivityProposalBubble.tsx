import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import { sportEmojiHint } from "../../lib/chatActivity";
import type { ActivityProposalRowLike } from "../../lib/messages/messageTypes";
import {
  buildProposalRulesContext,
  getActivityProposalStatus,
  getAvailableProposalActions,
  isProposalClosed,
} from "../../lib/messages/activityProposalRules";
import { normalizeActivityProposalStatus, statusBadgeLabelFr } from "../../lib/messages/activityProposal";

export type ActivityProposalBubbleProps = {
  proposal: ActivityProposalRowLike;
  currentUserId: string | null | undefined;
  conversationReady: boolean;
  pairBlocked: boolean;
  mine: boolean;
  /** Requête en cours sur une action proposition (toutes actions désactivées sur le fil). */
  proposalActionLocked: boolean;
  onOpenDetail: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  onCancel: () => void;
};

function formatWhenLine(p: ActivityProposalRowLike): string {
  if (p.scheduled_at) {
    try {
      const d = new Date(p.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
      }
    } catch {
      /* ignore */
    }
  }
  return p.time_slot?.trim() || "Créneau à confirmer";
}

export function ActivityProposalBubble({
  proposal: p,
  currentUserId,
  conversationReady,
  pairBlocked,
  mine,
  proposalActionLocked,
  onOpenDetail,
  onAccept,
  onDecline,
  onCounter,
  onCancel,
}: ActivityProposalBubbleProps) {
  const ctx = buildProposalRulesContext({
    proposal: p,
    currentUserId,
    conversationReady,
    pairBlocked,
  });
  const available = getAvailableProposalActions(ctx);
  const anyInteraction = available.accept || available.decline || available.counter || available.cancel;

  const effectiveStatus = getActivityProposalStatus(p, ctx.payload);
  const st = normalizeActivityProposalStatus(effectiveStatus);
  const closed = isProposalClosed(ctx.payload, p);
  const badge = statusBadgeLabelFr(st);

  const sportLine = p.sport?.trim() || "Activité";
  const emoji = sportEmojiHint(sportLine);
  const placeLine = p.location?.trim() || "—";
  const whenLine = formatWhenLine(p);
  const noteLine = p.note?.trim();

  const shellDisabled = proposalActionLocked || pairBlocked;
  const btn = (allowed: boolean) => shellDisabled || !allowed;

  return (
    <div
      id={`splove-proposal-${p.id}`}
      className={`max-w-[min(100%,22rem)] space-y-2 ${mine ? "ml-auto" : "mr-auto"}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (anyInteraction) return;
          onOpenDetail();
        }}
        onKeyDown={(e) => {
          if (anyInteraction) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetail();
          }
        }}
        className={`rounded-2xl border border-app-border/90 bg-app-card/95 px-4 py-3 shadow-sm ring-1 ring-white/[0.06] transition ${
          anyInteraction ? "" : "cursor-pointer hover:bg-app-border/25"
        }`}
      >
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em] text-app-muted">
          Proposition
        </p>

        <div className="mt-3 space-y-1.5 text-left">
          <p className="text-[15px] font-semibold leading-snug text-app-text">
            <span aria-hidden>{emoji} </span>
            {sportLine}
          </p>
          <p className="text-sm leading-snug text-app-text">
            <span aria-hidden>📍 </span>
            {placeLine}
          </p>
          <p className="text-sm leading-snug text-app-muted">
            <span aria-hidden>🕒 </span>
            {whenLine}
          </p>
        </div>

        <div className="my-3 border-t border-app-border/80" aria-hidden />

        <p className="text-center text-sm font-medium leading-snug text-app-text">Ça te dit ?</p>

        {noteLine ? (
          <p className="mt-2 text-center text-[13px] leading-snug text-app-muted">{noteLine}</p>
        ) : null}

        {!ctx.dataReliable ? (
          <p className="mt-2 text-center text-[11px] leading-snug text-app-muted">
            Informations de créneau incomplètes — actions désactivées.
          </p>
        ) : null}

        {available.accept || available.decline || available.counter ? (
          <div
            className="mt-3 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={btn(available.accept)}
              onClick={onAccept}
              className="w-full rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              ✅ Oui
            </button>
            <button
              type="button"
              disabled={btn(available.decline)}
              onClick={onDecline}
              className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border/40 disabled:opacity-50"
            >
              ❌ Non
            </button>
            <button
              type="button"
              disabled={btn(available.counter)}
              onClick={onCounter}
              className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border/40 disabled:opacity-50"
            >
              🔁 Proposer autre
            </button>
          </div>
        ) : null}

        {available.cancel ? (
          <div
            className="mt-3"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={btn(available.cancel)}
              onClick={onCancel}
              className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        ) : null}

        {closed && !anyInteraction && ctx.dataReliable ? (
          <p className="mt-2 text-center text-[11px] text-app-muted">Créneau clos — plus d’action possible.</p>
        ) : null}

        {badge ? (
          <p
            className={`mt-3 text-center text-[13px] font-semibold ${
              badge.tone === "success"
                ? "text-emerald-300/95"
                : badge.tone === "danger"
                  ? "text-rose-300/90"
                  : badge.tone === "warning"
                    ? "text-amber-200/90"
                    : "text-app-muted"
            }`}
          >
            {badge.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
