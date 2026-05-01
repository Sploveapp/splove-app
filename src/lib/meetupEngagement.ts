/**
 * Anti-ghosting / engagement — stocké dans `meetup_confirmation.engagement` (jsonb, sans nouvelle migration).
 */

import type { MeetupConfirmationPayload } from "./meetupConfirmation";
import {
  defaultMeetupEngagement,
  isMeetupTomorrowLocal,
  meetupLocalStartMs,
  type MeetupEngagementV1,
} from "./meetupEngagementCore";

export type { MeetupEngagementPhase, MeetupEngagementV1 } from "./meetupEngagementCore";
export {
  parseMeetupEngagementFromUnknown,
  defaultMeetupEngagement,
  meetupLocalStartMs,
  isMeetupTomorrowLocal,
} from "./meetupEngagementCore";

function participantIds(currentUserId: string, otherUserId: string | null): string[] {
  return otherUserId ? [currentUserId, otherUserId] : [currentUserId];
}

function userAnsweredTierJ1(uid: string, e: MeetupEngagementV1): boolean {
  return Boolean(e.j1_still_in_at?.[uid] || e.j1_reschedule_at?.[uid] || e.j1_cancel_at?.[uid]);
}

function everyoneAnsweredJ1(e: MeetupEngagementV1, currentUserId: string, otherUserId: string | null): boolean {
  return participantIds(currentUserId, otherUserId).every((id) => userAnsweredTierJ1(id, e));
}

function userAnsweredTierH2(uid: string, e: MeetupEngagementV1): boolean {
  return Boolean(e.h2_confirm_at?.[uid] || e.h2_delay_at?.[uid] || e.h2_cancel_at?.[uid]);
}

function everyoneAnsweredH2(e: MeetupEngagementV1, currentUserId: string, otherUserId: string | null): boolean {
  return participantIds(currentUserId, otherUserId).every((id) => userAnsweredTierH2(id, e));
}

export type EngagementReminderKind = "j1" | "h2" | "post";

export function resolveActiveEngagementReminder(
  nowMs: number,
  payload: MeetupConfirmationPayload,
  currentUserId: string,
  otherUserId: string | null,
): EngagementReminderKind | null {
  const e = payload.engagement;
  if (!e || e.phase === "cancelled_cleanly") return null;

  const startMs = meetupLocalStartMs(payload);
  if (startMs == null) return null;

  if (nowMs >= startMs) {
    if (!e.post_outcome) return "post";
    return null;
  }

  if (e.phase === "completed" || e.phase === "reschedule_requested") return null;

  const windowH2Ms = 2 * 60 * 60 * 1000;
  const inH2 = nowMs >= startMs - windowH2Ms && nowMs < startMs;
  const inTomorrow = isMeetupTomorrowLocal(nowMs, payload.date);

  if (inH2) {
    if (!everyoneAnsweredH2(e, currentUserId, otherUserId)) return "h2";
    return null;
  }
  if (inTomorrow && nowMs < startMs) {
    if (!everyoneAnsweredJ1(e, currentUserId, otherUserId)) return "j1";
    return null;
  }
  return null;
}

function bothIds(map: Record<string, string> | undefined, a: string, b: string): boolean {
  return Boolean(map?.[a] && map?.[b]);
}

export function recomputeEngagementPhase(
  e: MeetupEngagementV1,
  currentUserId: string,
  otherUserId: string | null,
): MeetupEngagementV1 {
  if (e.phase === "cancelled_cleanly") return e;
  if (e.cancelled_at && e.cancelled_by_user_id) {
    return { ...e, phase: "cancelled_cleanly" };
  }

  if (e.post_outcome === "happened_yes" || e.post_outcome === "happened_no") {
    return { ...e, phase: "completed", modify_flow_open: false };
  }
  if (e.post_outcome === "rescheduled") {
    return { ...e, phase: "reschedule_requested", modify_flow_open: true };
  }

  if (e.phase === "completed") return e;
  if (e.phase === "reschedule_requested") return e;

  if (otherUserId) {
    const j1b = bothIds(e.j1_still_in_at, currentUserId, otherUserId);
    const h2b = bothIds(e.h2_confirm_at, currentUserId, otherUserId);
    if (j1b || h2b) return { ...e, phase: "both_confirmed" };
  }

  return { ...e, phase: "date_confirmed" };
}

export function patchMeetupEngagement(
  payload: MeetupConfirmationPayload,
  patcher: (e: MeetupEngagementV1) => MeetupEngagementV1,
): MeetupConfirmationPayload {
  const baseEng = payload.engagement ?? defaultMeetupEngagement();
  return { ...payload, engagement: patcher(baseEng) };
}

export function finalizeMeetupEngagementPayload(
  payload: MeetupConfirmationPayload,
  currentUserId: string,
  otherUserId: string | null,
): MeetupConfirmationPayload {
  const baseEng = payload.engagement ?? defaultMeetupEngagement();
  return { ...payload, engagement: recomputeEngagementPhase(baseEng, currentUserId, otherUserId) };
}

function stampNow(): string {
  return new Date().toISOString();
}

export function stampJ1StillIn(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    modify_flow_open: false,
    j1_still_in_at: { ...eng.j1_still_in_at, [userId]: stampNow() },
  }));
}

export function stampJ1Reschedule(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  const base = payload.engagement ?? defaultMeetupEngagement();
  const now = stampNow();
  return patchMeetupEngagement(payload, () => ({
    ...base,
    version: 1,
    phase: "reschedule_requested",
    modify_flow_open: true,
    j1_reschedule_at: { ...base.j1_reschedule_at, [userId]: now },
  }));
}

export function stampJ1CleanCancel(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  const now = stampNow();
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    j1_cancel_at: { ...eng.j1_cancel_at, [userId]: now },
    cancelled_at: now,
    cancelled_by_user_id: userId,
    phase: "cancelled_cleanly",
  }));
}

export function stampH2Confirm(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    modify_flow_open: false,
    h2_confirm_at: { ...eng.h2_confirm_at, [userId]: stampNow() },
  }));
}

export function stampH2Delay(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  const base = payload.engagement ?? defaultMeetupEngagement();
  const now = stampNow();
  return patchMeetupEngagement(payload, () => ({
    ...base,
    version: 1,
    phase: "reschedule_requested",
    modify_flow_open: true,
    h2_delay_at: { ...base.h2_delay_at, [userId]: now },
  }));
}

export function stampH2CleanCancel(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  const now = stampNow();
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    h2_cancel_at: { ...eng.h2_cancel_at, [userId]: now },
    cancelled_at: now,
    cancelled_by_user_id: userId,
    phase: "cancelled_cleanly",
  }));
}

export function stampModifyFlow(payload: MeetupConfirmationPayload): MeetupConfirmationPayload {
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    modify_flow_open: true,
  }));
}

export function stampCleanCancelFromCard(payload: MeetupConfirmationPayload, userId: string): MeetupConfirmationPayload {
  const now = stampNow();
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    cancelled_at: now,
    cancelled_by_user_id: userId,
    phase: "cancelled_cleanly",
    modify_flow_open: false,
  }));
}

export function stampPostOutcome(
  payload: MeetupConfirmationPayload,
  userId: string,
  outcome: "happened_yes" | "happened_no" | "rescheduled",
): MeetupConfirmationPayload {
  const now = stampNow();
  const openModify = outcome === "rescheduled";
  return patchMeetupEngagement(payload, (eng) => ({
    ...eng,
    post_outcome: outcome,
    post_outcome_at: now,
    post_outcome_by_user_id: userId,
    phase: outcome === "rescheduled" ? "reschedule_requested" : "completed",
    modify_flow_open: openModify,
  }));
}

export function deriveMeetupEngagementFlags(
  payload: MeetupConfirmationPayload,
  currentUserId: string,
  otherUserId: string | null,
): {
  date_confirmed: boolean;
  confirmed_by_current_user_j1: boolean;
  confirmed_by_other_user_j1: boolean;
  confirmed_by_current_user_h2: boolean;
  confirmed_by_other_user_h2: boolean;
  both_confirmed: boolean;
  reschedule_requested: boolean;
  cancelled_cleanly: boolean;
  completed: boolean;
} {
  const e = payload.engagement ?? defaultMeetupEngagement();
  const j1cu = Boolean(e.j1_still_in_at?.[currentUserId]);
  const j1ot = otherUserId ? Boolean(e.j1_still_in_at?.[otherUserId]) : false;
  const h2cu = Boolean(e.h2_confirm_at?.[currentUserId]);
  const h2ot = otherUserId ? Boolean(e.h2_confirm_at?.[otherUserId]) : false;
  const j1both = otherUserId ? bothIds(e.j1_still_in_at, currentUserId, otherUserId) : j1cu;
  const h2both = otherUserId ? bothIds(e.h2_confirm_at, currentUserId, otherUserId) : h2cu;
  return {
    date_confirmed: Boolean(payload.status === "confirmed" && e.phase === "date_confirmed"),
    confirmed_by_current_user_j1: j1cu,
    confirmed_by_other_user_j1: j1ot,
    confirmed_by_current_user_h2: h2cu,
    confirmed_by_other_user_h2: h2ot,
    both_confirmed: e.phase === "both_confirmed" || j1both || h2both,
    reschedule_requested: e.phase === "reschedule_requested",
    cancelled_cleanly: e.phase === "cancelled_cleanly",
    completed: e.phase === "completed",
  };
}
