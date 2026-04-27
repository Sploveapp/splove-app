import { supabase } from "../lib/supabase";

export type RealLifeSessionCheckin = {
  activity_proposal_id: string;
  attendance_user_a_at: string | null;
  attendance_user_b_at: string | null;
  session_reported_by_user_a_at: string | null;
  session_reported_by_user_b_at: string | null;
  feedback_user_a: string | null;
  feedback_user_b: string | null;
  session_completed_at: string | null;
  partner_invite_dismissed_a: boolean;
  partner_invite_dismissed_b: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchRealLifeSessionCheckin(
  activityProposalId: string,
): Promise<RealLifeSessionCheckin | null> {
  const { data, error } = await supabase
    .from("real_life_session_checkins")
    .select(
      "activity_proposal_id, attendance_user_a_at, attendance_user_b_at, session_reported_by_user_a_at, session_reported_by_user_b_at, feedback_user_a, feedback_user_b, session_completed_at, partner_invite_dismissed_a, partner_invite_dismissed_b, created_at, updated_at",
    )
    .eq("activity_proposal_id", activityProposalId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST116" || error.code === "42P01") return null;
    console.warn("[rlSession] fetch checkin", error.message);
    return null;
  }
  return data as RealLifeSessionCheckin | null;
}

export async function callRlSessionConfirmAttendance(
  activityProposalId: string,
): Promise<{ ok: true; row: RealLifeSessionCheckin } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("rl_session_confirm_attendance", {
    p_proposal_id: activityProposalId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, row: data as RealLifeSessionCheckin };
}

export async function callRlSessionReportDone(input: {
  activityProposalId: string;
  feedback: string | null;
}): Promise<{ ok: true; row: RealLifeSessionCheckin } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("rl_session_report_done", {
    p_proposal_id: input.activityProposalId,
    p_feedback: input.feedback?.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, row: data as RealLifeSessionCheckin };
}

export async function callRlInviteNudgeDismiss(
  activityProposalId: string,
): Promise<{ ok: true; row: RealLifeSessionCheckin } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("rl_invite_nudge_dismiss", {
    p_proposal_id: activityProposalId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, row: data as RealLifeSessionCheckin };
}

/**
 * Côté client : le match ordonne user_a / user_b comme en base — on résout via l’indicateur
 * "je suis user_a" à partir d’un id match chargé ailleurs, ou on compare des timestamps
 * (chaque colonne a / b est alignée sur matches.user_a / user_b).
 */
export function checkinRowForCurrentUser(
  checkin: RealLifeSessionCheckin,
  ctx: { currentUserId: string; userA: string; userB: string },
): {
  iAmA: boolean;
  myAttendanceAt: string | null;
  partnerAttendanceAt: string | null;
  myReportAt: string | null;
  partnerReportAt: string | null;
  myFeedback: string | null;
  myInviteDismissed: boolean;
} {
  const iAmA = ctx.currentUserId === ctx.userA;
  return {
    iAmA,
    myAttendanceAt: iAmA ? checkin.attendance_user_a_at : checkin.attendance_user_b_at,
    partnerAttendanceAt: iAmA ? checkin.attendance_user_b_at : checkin.attendance_user_a_at,
    myReportAt: iAmA ? checkin.session_reported_by_user_a_at : checkin.session_reported_by_user_b_at,
    partnerReportAt: iAmA ? checkin.session_reported_by_user_b_at : checkin.session_reported_by_user_a_at,
    myFeedback: iAmA ? checkin.feedback_user_a : checkin.feedback_user_b,
    myInviteDismissed: iAmA ? checkin.partner_invite_dismissed_a : checkin.partner_invite_dismissed_b,
  };
}
