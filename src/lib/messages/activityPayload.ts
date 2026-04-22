/**
 * Payload JSON canonique des messages `activity_proposal` (`messages.payload`).
 * Lecture défensive + patches de mise à jour (alignés RPC `activity_proposals`).
 */

import type { ActivityProposalRowLike } from "./messageTypes";

export type ActivityProposalPayloadStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "reschedule_requested"
  | "countered"
  | "cancelled"
  | "expired";

export type ActivityProposalCounterPayload = {
  sport?: string;
  time?: string;
  location?: string;
  note?: string | null;
};

/** Forme cible affichage / persistance (clés optionnelles tolérées à la lecture). */
export type ActivityProposalPayloadV1 = {
  sport: string;
  time: string;
  location: string;
  status: ActivityProposalPayloadStatus | string;
  /** Auteur de la proposition (= proposer_id métier). */
  created_by: string;
  responded_by: string | null;
  responded_at: string | null;
  response: string | null;
  counter_proposal: ActivityProposalCounterPayload | null;
  /** Alias legacy / sync metadata */
  user_note?: string | null;
};

function normStatus(raw: string | null | undefined): string {
  const s = (raw ?? "pending").toLowerCase();
  if (s === "proposed") return "pending";
  if (s === "countered" || s === "alternative_requested" || s === "replaced") {
    return "reschedule_requested";
  }
  return s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Parse JSON Supabase (payload ou metadata) sans lever d’exception.
 */
export function parseActivityProposalPayload(raw: unknown): Partial<ActivityProposalPayloadV1> | null {
  if (raw == null || !isPlainObject(raw)) return null;
  const o = raw;
  const out: Partial<ActivityProposalPayloadV1> = {};

  if (typeof o.sport === "string") out.sport = o.sport;
  if (typeof o.time === "string") out.time = o.time;
  if (typeof o.location === "string") out.location = o.location;
  if (typeof o.status === "string") out.status = o.status;

  if (typeof o.created_by === "string") out.created_by = o.created_by;
  if (typeof o.proposer_id === "string" && out.created_by == null) out.created_by = o.proposer_id;

  if (o.responded_by === null || typeof o.responded_by === "string") out.responded_by = o.responded_by;
  if (o.responded_at === null || typeof o.responded_at === "string") out.responded_at = o.responded_at;
  if (o.response === null || typeof o.response === "string") out.response = o.response;

  if (o.counter_proposal === null) {
    out.counter_proposal = null;
  } else if (isPlainObject(o.counter_proposal)) {
    const c = o.counter_proposal;
    const cp: ActivityProposalCounterPayload = {};
    if (typeof c.sport === "string") cp.sport = c.sport;
    if (typeof c.time === "string") cp.time = c.time;
    if (typeof c.location === "string") cp.location = c.location;
    if (c.note === null || typeof c.note === "string") cp.note = c.note;
    out.counter_proposal = Object.keys(cp).length > 0 ? cp : {};
  }

  if (o.user_note === null || typeof o.user_note === "string") out.user_note = o.user_note;

  // Legacy metadata keys
  if (typeof o.sport_label === "string" && out.sport == null) out.sport = o.sport_label;
  if (typeof o.location_label === "string" && out.location == null) out.location = o.location_label;
  if (typeof o.scheduled_at_label === "string" && out.time == null) out.time = o.scheduled_at_label;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Fusionne payload (prioritaire) et metadata legacy pour affichage.
 */
export function mergeMessagePayloadLayers(msg: {
  payload?: unknown;
  metadata?: unknown;
}): Partial<ActivityProposalPayloadV1> | null {
  const meta = parseActivityProposalPayload(msg.metadata);
  const pay = parseActivityProposalPayload(msg.payload);
  if (!meta && !pay) return null;
  return { ...(meta ?? {}), ...(pay ?? {}) };
}

/**
 * Normalise un partiel vers une forme exploitable (valeurs par défaut sûres).
 */
export function normalizeActivityProposalPayloadForDisplay(
  merged: Partial<ActivityProposalPayloadV1> | null,
  fallbackSenderId: string,
): ActivityProposalPayloadV1 {
  const status = normStatus(merged?.status ?? "pending");
  return {
    sport: (merged?.sport ?? "").trim(),
    time: (merged?.time ?? "").trim(),
    location: (merged?.location ?? "").trim(),
    status,
    created_by: (merged?.created_by ?? fallbackSenderId).trim(),
    responded_by: merged?.responded_by ?? null,
    responded_at: merged?.responded_at ?? null,
    response: merged?.response ?? null,
    counter_proposal: merged?.counter_proposal ?? null,
    user_note: merged?.user_note ?? null,
  };
}

export function buildInitialActivityProposalPayload(input: {
  sport: string;
  location: string;
  timeLabel: string;
  createdBy: string;
  userNote: string | null;
}): ActivityProposalPayloadV1 {
  return {
    sport: input.sport.trim(),
    time: input.timeLabel.trim(),
    location: input.location.trim(),
    status: "pending",
    created_by: input.createdBy,
    responded_by: null,
    responded_at: null,
    response: null,
    counter_proposal: null,
    user_note: input.userNote?.trim() || null,
  };
}

export type ActivityProposalAction =
  | "accepted"
  | "declined"
  | "reschedule_requested"
  | "countered"
  | "cancelled";

/**
 * Fragment JSON à fusionner dans `messages.payload` (jsonb || patch).
 */
export function buildUpdatedActivityProposalPayload(
  action: ActivityProposalAction,
  responderId: string,
  options?: { counterProposal?: ActivityProposalCounterPayload | null },
): Record<string, string | ActivityProposalCounterPayload | null> {
  const now = new Date().toISOString();
  const base: Record<string, string | ActivityProposalCounterPayload | null> = {
    status: action,
    response: action,
    responded_by: responderId,
    responded_at: now,
  };
  if (action === "countered" || action === "reschedule_requested") {
    base.counter_proposal =
      options?.counterProposal && Object.keys(options.counterProposal).length > 0
        ? options.counterProposal
        : null;
  }
  return base;
}

export function isActivityProposalClosed(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return (
    s === "accepted" ||
    s === "declined" ||
    s === "reschedule_requested" ||
    s === "countered" ||
    s === "cancelled" ||
    s === "expired" ||
    s === "replaced"
  );
}

export function canRespondToActivityProposal(input: {
  conversationReady: boolean;
  currentUserId: string | null | undefined;
  payload: ActivityProposalPayloadV1 | null;
}): boolean {
  if (!input.conversationReady || !input.currentUserId || !input.payload) return false;
  const st = normStatus(input.payload.status);
  if (st !== "pending") return false;
  if (input.payload.responded_by != null && String(input.payload.responded_by).length > 0) return false;
  if (input.payload.created_by === input.currentUserId) return false;
  return true;
}

export function canCancelActivityProposal(input: {
  conversationReady: boolean;
  currentUserId: string | null | undefined;
  payload: ActivityProposalPayloadV1 | null;
}): boolean {
  if (!input.conversationReady || !input.currentUserId || !input.payload) return false;
  const st = normStatus(input.payload.status);
  if (st !== "pending") return false;
  if (input.payload.created_by !== input.currentUserId) return false;
  if (input.payload.responded_by != null && String(input.payload.responded_by).length > 0) return false;
  return true;
}

/** Pour brancher les garde-fous UI à partir de la ligne fusionnée (DB + payload message). */
export function activityProposalRowToPayloadV1(row: ActivityProposalRowLike): ActivityProposalPayloadV1 {
  return normalizeActivityProposalPayloadForDisplay(
    {
      sport: row.sport,
      time: row.time_slot,
      location: row.location ?? "",
      status: row.status ?? "pending",
      created_by: row.proposer_id,
      responded_by: row.responded_by ?? null,
      responded_at: row.responded_at ?? null,
      response: null,
      counter_proposal: null,
      user_note: row.note,
    },
    row.proposer_id,
  );
}

/** Mappe vers le partiel attendu par `mergeProposalRowWithPayload` (types messages existants). */
export function toLegacyMessagePayloadPartial(v: ActivityProposalPayloadV1): {
  sport?: string;
  location?: string;
  time?: string;
  status?: string;
  proposer_id?: string;
  responded_by?: string | null;
  responded_at?: string | null;
  user_note?: string | null;
} {
  return {
    sport: v.sport,
    location: v.location,
    time: v.time,
    status: v.status,
    proposer_id: v.created_by,
    responded_by: v.responded_by,
    responded_at: v.responded_at,
    user_note: v.user_note ?? null,
  };
}
