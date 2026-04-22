import { supabase } from "../lib/supabase";

export type ProposalStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "reschedule_requested";

export type ActivityProposal = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  match_id: string;
  sport: string;
  time_slot: string;
  location: string | null;
  note: string | null;
  status: ProposalStatus;
  expires_at: string | null;
  responded_at: string | null;
  reminder_6h_sent: boolean | null;
  reminder_18h_sent: boolean | null;
  expired_notified: boolean | null;
  created_at: string;
  updated_at: string;
};

const ACTIVITY_PROPOSAL_SELECT =
  "id, conversation_id, proposer_id, match_id, sport, time_slot, location, note, status, expires_at, responded_at, reminder_6h_sent, reminder_18h_sent, expired_notified, created_at, updated_at";

function defaultExpiryIso(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

export async function listConversationProposals(conversationId: string): Promise<ActivityProposal[]> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .select(ACTIVITY_PROPOSAL_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Impossible de charger les propositions.");
  return (data ?? []) as ActivityProposal[];
}

export async function getLatestProposalForConversation(conversationId: string): Promise<ActivityProposal | null> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .select(ACTIVITY_PROPOSAL_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "Impossible de charger la dernière proposition.");
  return (data as ActivityProposal | null) ?? null;
}

export async function createConversationProposal(input: {
  conversationId: string;
  proposerId: string;
  matchId: string;
  sport: string;
  timeSlot: string;
  location: string | null;
  note: string | null;
}): Promise<ActivityProposal> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .insert({
      conversation_id: input.conversationId,
      proposer_id: input.proposerId,
      match_id: input.matchId,
      sport: input.sport.trim(),
      time_slot: input.timeSlot.trim(),
      location: input.location?.trim() || null,
      note: input.note?.trim() || null,
      status: "pending",
      expires_at: defaultExpiryIso(),
    })
    .select(ACTIVITY_PROPOSAL_SELECT)
    .single();
  if (error) throw new Error(error.message || "Création de proposition impossible.");
  return data as ActivityProposal;
}

export async function acceptConversationProposal(proposalId: string): Promise<ActivityProposal> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select(ACTIVITY_PROPOSAL_SELECT)
    .single();
  if (error) throw new Error(error.message || "Acceptation impossible.");
  return data as ActivityProposal;
}

export async function declineConversationProposal(proposalId: string): Promise<ActivityProposal> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select(ACTIVITY_PROPOSAL_SELECT)
    .single();
  if (error) throw new Error(error.message || "Refus impossible.");
  return data as ActivityProposal;
}

export async function requestConversationProposalReschedule(input: {
  proposalId: string;
  conversationId: string;
  proposerId: string;
  matchId: string;
  sport: string;
  timeSlot: string;
  location: string | null;
  note: string | null;
}): Promise<ActivityProposal> {
  const now = new Date().toISOString();
  const { error: markError } = await supabase
    .from("activity_proposals")
    .update({ status: "reschedule_requested", responded_at: now })
    .eq("id", input.proposalId)
    .eq("status", "pending");
  if (markError) throw new Error(markError.message || "Replanification impossible.");

  return createConversationProposal({
    conversationId: input.conversationId,
    proposerId: input.proposerId,
    matchId: input.matchId,
    sport: input.sport,
    timeSlot: input.timeSlot,
    location: input.location,
    note: input.note,
  });
}

