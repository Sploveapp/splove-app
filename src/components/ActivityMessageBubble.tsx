import type { ActivityPayload } from "../lib/chatActivity";
import {
  GUIDED_REPLY_NOT_AVAILABLE,
  GUIDED_REPLY_OTHER_TIME,
  GUIDED_REPLY_YES,
  whenLabelFr,
} from "../lib/chatActivity";
import { APP_BORDER, APP_CARD, APP_TEXT, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type Props = {
  payload: ActivityPayload;
  mine: boolean;
  showGuidedReplies?: boolean;
  onGuidedReply: (text: string) => void;
  sending?: boolean;
};

export function ActivityMessageBubble({
  payload,
  mine,
  showGuidedReplies,
  onGuidedReply,
  sending,
}: Props) {
  const placeLine = payload.place?.trim();

  return (
    <div className="space-y-2">
      <div
        className={`max-w-[90%] rounded-2xl px-3.5 py-3 shadow-sm ${
          mine ? "ml-auto text-left" : ""
        }`}
        style={{
          background: mine ? BRAND_BG : APP_CARD,
          color: mine ? TEXT_ON_BRAND : APP_TEXT,
          border: mine ? undefined : `1px solid ${APP_BORDER}`,
          boxShadow: mine ? undefined : "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
          Proposition d’activité
        </p>
        <p className="mt-1 text-[13px] opacity-90">
          {payload.sport}
          <span className="mx-1 opacity-60">·</span>
          {whenLabelFr(payload.when)}
          {placeLine ? (
            <>
              <span className="mx-1 opacity-60">·</span>
              {placeLine}
            </>
          ) : null}
        </p>
        <p className="mt-2 text-[15px] leading-snug">{payload.message}</p>
      </div>

      {showGuidedReplies && !mine && (
        <div className="flex max-w-[95%] flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">Réponses rapides</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => onGuidedReply(GUIDED_REPLY_YES)}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              J’y vais
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => onGuidedReply(GUIDED_REPLY_OTHER_TIME)}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              Proposer un autre moment
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => onGuidedReply(GUIDED_REPLY_NOT_AVAILABLE)}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              Pas dispo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
