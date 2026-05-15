import { isPendingProposalStatus } from "./messages/activityProposal";
import { supabase } from "./supabase";

/** Proposition en attente de réponse par l'utilisateur courant (pas l'auteur). */
export function activityProposalNeedsUserAction(
  userId: string,
  row: { proposer_id: string; status?: string | null },
): boolean {
  if (!userId || row.proposer_id === userId) return false;
  return isPendingProposalStatus(row.status);
}

export async function fetchActivityProposalsPendingActionCount(userId: string): Promise<number> {
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("activity_proposals")
    .select("id, proposer_id, status")
    .in("status", ["pending", "proposed"]);

  if (error) {
    console.warn("[activityProposalPendingAction] count", error);
    return 0;
  }

  return (data ?? []).filter((row) =>
    activityProposalNeedsUserAction(userId, row as { proposer_id: string; status?: string | null }),
  ).length;
}
