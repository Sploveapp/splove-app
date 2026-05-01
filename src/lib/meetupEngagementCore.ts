/**
 * Types et parsing engagement — aucune dépendance vers meetupConfirmation (évite cycles d’import).
 */

export type MeetupEngagementPhase =
  | "date_confirmed"
  | "both_confirmed"
  | "reschedule_requested"
  | "cancelled_cleanly"
  | "completed";

export type MeetupEngagementV1 = {
  version: 1;
  phase: MeetupEngagementPhase;
  modify_flow_open?: boolean;
  j1_still_in_at?: Record<string, string>;
  j1_reschedule_at?: Record<string, string>;
  j1_cancel_at?: Record<string, string>;
  h2_confirm_at?: Record<string, string>;
  h2_delay_at?: Record<string, string>;
  h2_cancel_at?: Record<string, string>;
  post_outcome?: "happened_yes" | "happened_no" | "rescheduled" | null;
  post_outcome_at?: string | null;
  post_outcome_by_user_id?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
};

export function defaultMeetupEngagement(): MeetupEngagementV1 {
  return { version: 1, phase: "date_confirmed" };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

const PHASES: MeetupEngagementPhase[] = [
  "date_confirmed",
  "both_confirmed",
  "reschedule_requested",
  "cancelled_cleanly",
  "completed",
];

export function parseMeetupEngagementFromUnknown(raw: unknown): MeetupEngagementV1 | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.version !== 1) return undefined;
  const phase = raw.phase;
  if (typeof phase !== "string" || !PHASES.includes(phase as MeetupEngagementPhase)) return undefined;

  const readMap = (k: string): Record<string, string> | undefined => {
    const v = raw[k];
    if (!isRecord(v)) return undefined;
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(v)) {
      if (typeof val === "string" && val.trim()) out[key] = val.trim();
    }
    return Object.keys(out).length ? out : undefined;
  };

  const e: MeetupEngagementV1 = {
    version: 1,
    phase: phase as MeetupEngagementPhase,
  };

  if (raw.modify_flow_open === true) e.modify_flow_open = true;

  const j1s = readMap("j1_still_in_at");
  const j1r = readMap("j1_reschedule_at");
  const j1c = readMap("j1_cancel_at");
  const h2k = readMap("h2_confirm_at");
  const h2d = readMap("h2_delay_at");
  const h2x = readMap("h2_cancel_at");
  if (j1s) e.j1_still_in_at = j1s;
  if (j1r) e.j1_reschedule_at = j1r;
  if (j1c) e.j1_cancel_at = j1c;
  if (h2k) e.h2_confirm_at = h2k;
  if (h2d) e.h2_delay_at = h2d;
  if (h2x) e.h2_cancel_at = h2x;

  const po = raw.post_outcome;
  if (po === "happened_yes" || po === "happened_no" || po === "rescheduled") {
    e.post_outcome = po;
  } else if (po === null) e.post_outcome = null;

  if (typeof raw.post_outcome_at === "string" && raw.post_outcome_at.trim()) {
    e.post_outcome_at = raw.post_outcome_at.trim();
  }
  if (typeof raw.post_outcome_by_user_id === "string" && raw.post_outcome_by_user_id.trim()) {
    e.post_outcome_by_user_id = raw.post_outcome_by_user_id.trim();
  }
  if (typeof raw.cancelled_at === "string" && raw.cancelled_at.trim()) {
    e.cancelled_at = raw.cancelled_at.trim();
  }
  if (typeof raw.cancelled_by_user_id === "string" && raw.cancelled_by_user_id.trim()) {
    e.cancelled_by_user_id = raw.cancelled_by_user_id.trim();
  }

  return e;
}

export function meetupLocalStartMs(slice: Pick<{ date: string; time: string }, "date" | "time">): number | null {
  const d = slice.date?.trim() ?? "";
  const t = slice.time?.trim() ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m || !tm) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  if (
    [y, mo, day, hh, mm].some((n) => !Number.isFinite(n)) ||
    mo < 1 ||
    mo > 12 ||
    day < 1 ||
    day > 31 ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }
  const dt = new Date(y, mo - 1, day, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

export function isMeetupTomorrowLocal(nowMs: number, meetupYmd: string): boolean {
  const dMeet = meetupYmd.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dMeet);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const meet = new Date(y, mo - 1, day, 12, 0, 0, 0);
  const now = new Date(nowMs);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const diffDays = Math.round((meet.getTime() - t0.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays === 1;
}
