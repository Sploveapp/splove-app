export type ActivityProposalStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "countered"
  | "cancelled";

export interface ActivityProposal {
  id: string;
  conversation_id: string;
  proposer_id: string;
  sport: string;
  place: string;
  scheduled_at: string;
  status: ActivityProposalStatus;
  counter_of: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

