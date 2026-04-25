import type { ActivityPayload } from "../lib/chatActivity";
import { formatActivityReply } from "../lib/chatActivity";
import type { ActivityReplyChoice } from "../lib/chatActivity";
import { APP_BORDER, APP_CARD, APP_TEXT, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  payload: ActivityPayload;
  mine: boolean;
  showGuidedReplies?: boolean;
  onGuidedReply: (text: string) => void;
  sending?: boolean;
};

function whenLabelI18n(w: ActivityPayload["when"], t: (k: string) => string): string {
  switch (w) {
    case "tonight":
      return t("activity_when_tonight");
    case "tomorrow":
      return t("activity_when_tomorrow");
    case "week":
      return t("activity_when_week");
    case "weekend":
      return t("activity_when_weekend");
    case "other":
    default:
      return t("activity_when_other");
  }
}

export function ActivityMessageBubble({
  payload,
  mine,
  showGuidedReplies,
  onGuidedReply,
  sending,
}: Props) {
  const { t } = useTranslation();
  const placeLine = payload.place?.trim();
  const sendGuided = (choice: ActivityReplyChoice) => onGuidedReply(formatActivityReply(choice));

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
          {t("activity_title")}
        </p>
        <p className="mt-1 text-[13px] opacity-90">
          {payload.sport}
          <span className="mx-1 opacity-60">·</span>
          {whenLabelI18n(payload.when, t)}
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
          <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {t("activity_quick_replies_title")}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => sendGuided("go")}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              {t("guided_reply_yes_label")}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => sendGuided("other_slot")}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              {t("guided_reply_other_time_label")}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => sendGuided("not_available")}
              className="rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-[14px] font-medium text-app-text shadow-sm hover:bg-app-border disabled:opacity-50"
            >
              {t("guided_reply_not_available_label")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
