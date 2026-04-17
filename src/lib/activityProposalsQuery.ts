/**
 * Colonnes pour `activity_proposals` — ne jamais inclure `match_id` sur cette table
 * (schéma MVP 062 : le match passe par `conversation_id` → `conversations.match_id`).
 */

/** Select principal : champs utiles UI + RPC, sans `match_id`. */
export const ACTIVITY_PROPOSALS_SELECT =
  "id, conversation_id, proposer_id, sport, place, time_slot, location, note, created_at, status, scheduled_at, boost_awarded, supersedes_proposal_id, responded_by, responded_at, counter_of";

/** Si une colonne optionnelle manque sur une vieille base. */
export const ACTIVITY_PROPOSALS_SELECT_MINIMAL =
  "id, conversation_id, proposer_id, sport, time_slot, location, note, created_at, status, scheduled_at, responded_by, responded_at";

export function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = (err.message ?? "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("column");
}
