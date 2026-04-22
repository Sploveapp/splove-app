/**
 * Colonnes pour `activity_proposals` — ne jamais inclure `match_id` sur cette table
 * (schéma MVP 062 : le match passe par `conversation_id` → `conversations.match_id`).
 */

/** Select principal : champs utiles UI + RPC, sans `match_id`. */
export const ACTIVITY_PROPOSALS_SELECT =
  "id, conversation_id, proposer_id, match_id, sport, time_slot, location, note, status, expires_at, responded_at, reminder_6h_sent, reminder_18h_sent, expired_notified, created_at, updated_at";

/** Si une colonne optionnelle manque sur une vieille base. */
export const ACTIVITY_PROPOSALS_SELECT_MINIMAL =
  "id, conversation_id, proposer_id, match_id, sport, time_slot, location, note, status, expires_at, responded_at, created_at, updated_at";

export function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = (err.message ?? "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("column");
}
