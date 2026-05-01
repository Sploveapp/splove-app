import { useCallback, type ReactNode } from "react";
import type { MeetupConfirmationPayload } from "../lib/meetupConfirmation";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import {
  finalizeMeetupEngagementPayload,
  resolveActiveEngagementReminder,
  stampCleanCancelFromCard,
  stampH2CleanCancel,
  stampH2Confirm,
  stampH2Delay,
  stampJ1CleanCancel,
  stampJ1Reschedule,
  stampJ1StillIn,
  stampModifyFlow,
  stampPostOutcome,
} from "../lib/meetupEngagement";
import { MeetingConfirmedCard } from "./MeetingConfirmedCard";

export type MeetupEngagementChatBlockProps = {
  payload: MeetupConfirmationPayload;
  proposalId: string;
  /** Utilisateur connecté — actions anti-ghost. */
  currentUserId: string;
  partnerUserId: string | null;
  nowMs: number;
  persistBusy?: boolean;
  onPersistPayload: (next: MeetupConfirmationPayload) => Promise<void>;
};

export function MeetupEngagementChatBlock({
  payload,
  proposalId,
  currentUserId,
  partnerUserId,
  nowMs,
  persistBusy,
  onPersistPayload,
}: MeetupEngagementChatBlockProps) {
  const { t } = useTranslation();
  const eng = payload.engagement;

  const run = useCallback(
    async (next: MeetupConfirmationPayload) => {
      await onPersistPayload(
        finalizeMeetupEngagementPayload(next, currentUserId, partnerUserId),
      );
    },
    [currentUserId, partnerUserId, onPersistPayload],
  );

  const reminder = resolveActiveEngagementReminder(nowMs, payload, currentUserId, partnerUserId);

  const cardMuted = Boolean(eng?.phase === "cancelled_cleanly" || eng?.phase === "completed");

  return (
    <div className="mb-3 space-y-3">
      {!cardMuted ? (
        <>
          <MeetingConfirmedCard
            payload={payload}
            proposalId={proposalId}
            headlineTone="celebrate"
          />
          {eng?.phase !== "cancelled_cleanly" && eng?.phase !== "completed" && eng?.phase !== "reschedule_requested" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={persistBusy}
                onClick={() => void run(stampModifyFlow(payload))}
                className="flex-1 rounded-xl border border-emerald-400/35 bg-emerald-950/25 py-2.5 text-[13px] font-semibold text-emerald-100 transition hover:bg-emerald-950/45 disabled:opacity-50"
              >
                {t("meetup_engagement.action_modify")}
              </button>
              <button
                type="button"
                disabled={persistBusy}
                onClick={() => void run(stampCleanCancelFromCard(payload, currentUserId))}
                className="flex-1 rounded-xl border border-white/18 bg-black/25 py-2.5 text-[13px] font-semibold text-white/85 transition hover:bg-black/38 disabled:opacity-50"
              >
                {t("meetup_engagement.action_clean_cancel")}
              </button>
            </div>
          ) : null}
        </>
      ) : eng?.phase === "cancelled_cleanly" ? (
        <MeetupMutedCard>
          <p className="text-center text-[14px] font-semibold text-white">{t("meetup_engagement.cancelled_headline")}</p>
          <p className="mt-2 text-center text-[12px] leading-snug text-white/72">{t("meetup_engagement.cancelled_hint")}</p>
        </MeetupMutedCard>
      ) : (
        <>
          <MeetingConfirmedCard payload={payload} proposalId={proposalId} headlineTone="neutral" subtle />
          {eng?.post_outcome === "happened_yes" ? (
            <MeetupMutedCard>
              <p className="text-center text-[14px] font-semibold text-emerald-100">{t("meetup_engagement.outcome_thanks_yes")}</p>
            </MeetupMutedCard>
          ) : eng?.post_outcome === "happened_no" ? (
            <MeetupMutedCard>
              <p className="text-center text-[14px] font-semibold text-white">{t("meetup_engagement.outcome_thanks_no")}</p>
            </MeetupMutedCard>
          ) : null}
        </>
      )}

      {reminder === "j1" && eng?.phase !== "cancelled_cleanly" && eng?.phase !== "completed" ? (
        <EngagementNudge tone="warm">
          <p className="text-center text-[14px] font-semibold leading-snug text-white">{t("meetup_engagement.reminder_j1_body")}</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampJ1StillIn(payload, currentUserId))}
              className="w-full rounded-xl py-3 text-[14px] font-bold shadow-md transition hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {t("meetup_engagement.reminder_j1_confirm")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampJ1Reschedule(payload, currentUserId))}
              className="w-full rounded-xl border border-amber-200/35 bg-black/35 py-2.5 text-[13px] font-semibold text-amber-100 transition hover:bg-black/48 disabled:opacity-50"
            >
              {t("meetup_engagement.reminder_j1_reschedule")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampJ1CleanCancel(payload, currentUserId))}
              className="w-full rounded-xl border border-white/16 py-2.5 text-[13px] font-semibold text-white/78 transition hover:bg-white/8 disabled:opacity-50"
            >
              {t("meetup_engagement.reminder_clean_cancel")}
            </button>
          </div>
        </EngagementNudge>
      ) : null}

      {reminder === "h2" && eng?.phase !== "cancelled_cleanly" && eng?.phase !== "completed" ? (
        <EngagementNudge tone="brand">
          <p className="text-center text-[14px] font-semibold leading-snug text-white">{t("meetup_engagement.reminder_h2_body")}</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampH2Confirm(payload, currentUserId))}
              className="w-full rounded-xl py-3 text-[14px] font-bold shadow-md transition hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {t("meetup_engagement.reminder_h2_confirm")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampH2Delay(payload, currentUserId))}
              className="w-full rounded-xl border border-white/22 bg-black/38 py-2.5 text-[13px] font-semibold text-white transition hover:bg-black/52 disabled:opacity-50"
            >
              {t("meetup_engagement.reminder_h2_delay")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampH2CleanCancel(payload, currentUserId))}
              className="w-full rounded-xl border border-white/14 py-2.5 text-[13px] font-semibold text-white/74 transition hover:bg-white/8 disabled:opacity-50"
            >
              {t("meetup_engagement.reminder_clean_cancel")}
            </button>
          </div>
        </EngagementNudge>
      ) : null}

      {reminder === "post" && eng?.phase !== "cancelled_cleanly" && !eng?.post_outcome ? (
        <EngagementNudge tone="soft">
          <p className="text-center text-[14px] font-semibold leading-snug text-app-text">{t("meetup_engagement.post_meet_body")}</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampPostOutcome(payload, currentUserId, "happened_yes"))}
              className="w-full rounded-xl py-3 text-[14px] font-bold transition hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {t("meetup_engagement.post_meet_yes")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampPostOutcome(payload, currentUserId, "happened_no"))}
              className="w-full rounded-xl border border-app-border bg-app-card py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border/40 disabled:opacity-50"
            >
              {t("meetup_engagement.post_meet_no")}
            </button>
            <button
              type="button"
              disabled={persistBusy}
              onClick={() => void run(stampPostOutcome(payload, currentUserId, "rescheduled"))}
              className="w-full rounded-xl border border-app-border/80 bg-transparent py-2.5 text-[13px] font-semibold text-app-muted transition hover:bg-white/6 disabled:opacity-50"
            >
              {t("meetup_engagement.post_meet_rescheduled")}
            </button>
          </div>
        </EngagementNudge>
      ) : null}

      {eng?.phase === "reschedule_requested" && eng.modify_flow_open ? (
        <div className="rounded-2xl border border-amber-300/35 bg-amber-950/25 px-4 py-3 text-[12px] leading-snug text-amber-100/95">
          {t("meetup_engagement.reschedule_waiting")}
        </div>
      ) : null}
    </div>
  );
}

function EngagementNudge({
  tone,
  children,
}: {
  tone: "warm" | "brand" | "soft";
  children: ReactNode;
}) {
  const toneClass =
    tone === "soft"
      ? "border-app-border bg-app-card/95 ring-white/[0.04]"
      : tone === "brand"
        ? "border-[#FF1E2D]/42 bg-black/52 ring-[#FF1E2D]/15"
        : "border-amber-300/42 bg-black/52 ring-amber-200/14";
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ring-1 ${toneClass}`}>{children}</div>
  );
}

function MeetupMutedCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/42 px-4 py-4 text-[13px] leading-snug text-white/82 ring-1 ring-white/[0.05]">
      {children}
    </div>
  );
}
