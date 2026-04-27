import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import type { RealLifeSessionCheckin } from "../services/realLifeSessionCheckin.service";
import {
  callRlInviteNudgeDismiss,
  callRlSessionConfirmAttendance,
  callRlSessionReportDone,
  checkinRowForCurrentUser,
} from "../services/realLifeSessionCheckin.service";
import { buildAuthReferralLink, fetchGrowthProfileFields } from "../services/referral.service";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  activityProposalId: string;
  userA: string;
  userB: string;
  checkin: RealLifeSessionCheckin | null;
  onCheckinUpdate: (row: RealLifeSessionCheckin | null) => void;
  busy?: boolean;
};

const FEEDBACK_MAX = 200;

export function RealLifeSessionPanel({
  activityProposalId,
  userA,
  userB,
  checkin,
  onCheckinUpdate,
  busy = false,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [actionBusy, setActionBusy] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const me = checkin
    ? checkinRowForCurrentUser(checkin, { currentUserId: user?.id ?? "", userA, userB })
    : {
        iAmA: (user?.id ?? "") === userA,
        myAttendanceAt: null as string | null,
        partnerAttendanceAt: null as string | null,
        myReportAt: null as string | null,
        partnerReportAt: null as string | null,
        myFeedback: null as string | null,
        myInviteDismissed: false,
      };

  if (!user?.id) return null;

  const bothAttended = Boolean(
    checkin?.attendance_user_a_at && checkin?.attendance_user_b_at,
  );
  const completed = Boolean(checkin?.session_completed_at);
  const myAttendanceDone = Boolean(me.myAttendanceAt);
  const myReportDone = Boolean(me.myReportAt);
  const showInviteCta = completed && !me.myInviteDismissed;

  async function onConfirmAttendance() {
    setActionBusy(true);
    try {
      const res = await callRlSessionConfirmAttendance(activityProposalId);
      if (res.ok) onCheckinUpdate(res.row);
    } finally {
      setActionBusy(false);
    }
  }

  async function onReportDone() {
    setActionBusy(true);
    try {
      const res = await callRlSessionReportDone({
        activityProposalId,
        feedback: feedbackDraft || null,
      });
      if (res.ok) {
        onCheckinUpdate(res.row);
        setFeedbackDraft("");
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function onDismissInvite() {
    setActionBusy(true);
    try {
      const res = await callRlInviteNudgeDismiss(activityProposalId);
      if (res.ok) onCheckinUpdate(res.row);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="mb-3 space-y-3">
      <div className="rounded-2xl border border-app-border bg-app-card px-4 py-3 shadow-sm ring-1 ring-white/[0.06]">
        <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-app-muted">
          {t("rl_session_real_life_title")}
        </p>
        <p className="mt-1 text-center text-[13px] font-medium leading-snug text-app-text">
          {t("rl_session_density_hint")}
        </p>
      </div>

      {!myAttendanceDone ? (
        <div className="rounded-2xl border border-app-border/90 bg-app-card/90 px-3 py-2.5 shadow-sm">
          <p className="text-[12px] font-medium text-app-text">{t("rl_session_attendance_prompt")}</p>
          <button
            type="button"
            disabled={actionBusy || busy}
            onClick={() => void onConfirmAttendance()}
            className="mt-2 w-full rounded-xl border border-app-border py-2.5 text-[13px] font-bold text-app-text transition hover:bg-app-border disabled:cursor-wait disabled:opacity-50"
          >
            {t("rl_session_i_attended")}
          </button>
        </div>
      ) : null}

      {myAttendanceDone && !bothAttended ? (
        <p className="text-center text-[12px] text-app-muted">{t("rl_session_waiting_partner_attendance")}</p>
      ) : null}

      {bothAttended && !myReportDone ? (
        <div className="rounded-2xl border border-app-border/90 bg-app-card px-3 py-2.5 shadow-sm">
          <p className="text-[12px] font-medium leading-snug text-app-text">{t("rl_session_close_prompt")}</p>
          <label className="mt-2 block text-[11px] font-medium text-app-muted" htmlFor="rl-feedback">
            {t("rl_session_feedback_optional")}
          </label>
          <textarea
            id="rl-feedback"
            className="mt-1 w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted"
            rows={2}
            maxLength={FEEDBACK_MAX}
            value={feedbackDraft}
            onChange={(e) => setFeedbackDraft(e.target.value.slice(0, FEEDBACK_MAX))}
            placeholder={t("rl_session_feedback_placeholder")}
            disabled={actionBusy || busy}
          />
          <button
            type="button"
            disabled={actionBusy || busy}
            onClick={() => void onReportDone()}
            className="mt-2 w-full rounded-xl py-2.5 text-[14px] font-bold shadow-sm transition hover:opacity-95 disabled:cursor-wait disabled:opacity-50"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {t("rl_session_mark_done")}
          </button>
        </div>
      ) : null}

      {myReportDone && !completed ? (
        <p className="text-center text-[12px] text-app-muted">{t("rl_session_waiting_partner_close")}</p>
      ) : null}

      {showInviteCta ? (
        <div className="rounded-2xl border border-app-border/90 bg-app-bg/80 px-3 py-2.5">
          <p className="text-[12px] font-medium leading-snug text-app-text">{t("rl_session_invite_partner_cta")}</p>
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              disabled={actionBusy}
              onClick={async () => {
                const g = await fetchGrowthProfileFields(user.id);
                const code = g?.referral_code;
                if (!code) return;
                const link = buildAuthReferralLink(code);
                try {
                  await navigator.clipboard.writeText(link);
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  setLinkCopied(false);
                }
              }}
              className="w-full rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {linkCopied ? t("rl_session_link_copied") : t("rl_session_copy_invite_link")}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-app-border py-2 text-[12px] font-semibold text-app-text hover:bg-app-border"
              onClick={() => void navigate("/profile")}
            >
              {t("rl_session_see_referral_code")}
            </button>
            <button
              type="button"
              className="w-full text-[11px] font-medium text-app-muted underline-offset-2 hover:underline"
              onClick={() => void onDismissInvite()}
            >
              {t("rl_session_dismiss_invite_nudge")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
