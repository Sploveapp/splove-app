/**
 * Types messages structurés — alignés sur `messages.metadata` (JSONB) et `activity_proposals`.
 */

export const ACTIVITY_PROPOSAL_MESSAGE_TYPES = {
  proposal: "activity_proposal",
  response: "activity_proposal_response",
} as const;

export type ActivityProposalMessageType =
  (typeof ACTIVITY_PROPOSAL_MESSAGE_TYPES)[keyof typeof ACTIVITY_PROPOSAL_MESSAGE_TYPES];

/** Statuts métier (payload + ligne SQL). */
export type ActivityProposalStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "countered"
  | "cancelled"
  | "expired";

/** Champs attendus dans `messages.metadata` pour une proposition (denormalisés). */
export type ActivityProposalMessagePayload = {
  sport: string;
  location: string;
  time: string;
  status: ActivityProposalStatus | string;
  proposer_id: string;
  responded_by: string | null;
  responded_at: string | null;
  /** Texte utilisateur optionnel (sous la carte), sans dupliquer sport/lieu/créneau. */
  user_note?: string | null;
};

export type ActivityProposalRowLike = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  sport: string;
  time_slot: string;
  location: string | null;
  note: string | null;
  created_at: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  match_id?: string | null;
  boost_awarded?: boolean | null;
  supersedes_proposal_id?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
};
