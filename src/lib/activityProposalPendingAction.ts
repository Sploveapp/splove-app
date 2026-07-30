import { normalizeActivityProposalStatus } from "./messages/activityProposal";
import { parseSupabaseTimestamp } from "./parseSupabaseTimestamp";
import { supabase } from "./supabase";

const PENDING_ACTION_STATUSES = ["pending", "proposed", "countered", "counter_proposed", "reschedule_requested"];

const CHAT_WINDOW_HOURS_MS = 48 * 60 * 60 * 1000;

export type ActivityProposalPendingRow = {
  proposer_id: string;
  status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

function isExpiredProposal(row: ActivityProposalPendingRow, nowMs: number): boolean {
  const st = normalizeActivityProposalStatus(row.status);
  if (st === "expired") return true;
  if (st !== "pending" && st !== "proposed" && st !== "countered" && st !== "reschedule_requested") {
    return false;
  }
  const createdMs = parseSupabaseTimestamp(row.created_at ?? null);
  const fallbackExp = createdMs > 0 ? createdMs + CHAT_WINDOW_HOURS_MS : NaN;
  const expMs = row.expires_at ? parseSupabaseTimestamp(row.expires_at) : fallbackExp;
  if (!Number.isFinite(expMs)) return false;
  return expMs <= nowMs;
}

/** Proposition nécessitant une action de l'utilisateur (aligné sur Mes rencontres → À confirmer). */
export function activityProposalNeedsUserAction(
  userId: string,
  row: ActivityProposalPendingRow,
  nowMs: number = Date.now(),
): boolean {
  if (!userId || row.proposer_id === userId) return false;
  if (isExpiredProposal(row, nowMs)) return false;

  const st = normalizeActivityProposalStatus(row.status);
  return st === "pending" || st === "reschedule_requested";
}

export async function fetchActivityProposalsPendingActionCount(
  userId: string,
  nowMs: number = Date.now(),
): Promise<number> {
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("activity_proposals")
    .select("id, proposer_id, status, created_at, expires_at")
    .in("status", PENDING_ACTION_STATUSES);

  if (error) {
    console.warn("[activityProposalPendingAction] count", error);
    return 0;
  }

  return (data ?? []).filter((row) =>
    activityProposalNeedsUserAction(userId, row as ActivityProposalPendingRow, nowMs),
  ).length;
}
