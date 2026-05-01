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
  meetup_confirmation?: unknown | null;
};

const ACTIVITY_PROPOSAL_SELECT =
  "id, conversation_id, proposer_id, match_id, sport, time_slot, location, note, status, expires_at, responded_at, reminder_6h_sent, reminder_18h_sent, expired_notified, created_at, updated_at, meetup_confirmation";

function defaultExpiryIso(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

async function verifyCoreTablesReady(): Promise<boolean> {
  const checks = await Promise.all([
    supabase.from("profiles").select("id").limit(1),
    supabase.from("sports").select("id").limit(1),
    supabase.from("profile_sports").select("profile_id").limit(1),
    supabase.from("matches").select("id").limit(1),
    supabase.from("conversations").select("id").limit(1),
    supabase.from("messages").select("id").limit(1),
  ]);
  return checks.every((r) => !r.error);
}

type SportCandidate = {
  id: string;
  label: string;
  active?: boolean | null;
  is_quick_date?: boolean | null;
  is_date_friendly?: boolean | null;
  is_featured?: boolean | null;
};

function asBool(v: unknown): boolean {
  return v === true;
}

function scoreSportCandidate(s: SportCandidate): number {
  let score = 0;
  if (asBool(s.active)) score += 8;
  if (asBool(s.is_quick_date)) score += 4;
  if (asBool(s.is_date_friendly)) score += 2;
  if (asBool(s.is_featured)) score += 1;
  return score;
}

function pickBestCommonSport(candidates: SportCandidate[]): SportCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const sa = scoreSportCandidate(a);
    const sb = scoreSportCandidate(b);
    if (sb !== sa) return sb - sa;
    return a.label.localeCompare(b.label, "fr");
  })[0] ?? null;
}

async function loadSportsForProfiles(profileIds: string[]): Promise<Map<string, SportCandidate[]>> {
  const { data, error } = await supabase
    .from("profile_sports")
    .select("profile_id, sports(id, label, active, is_quick_date, is_date_friendly, is_featured)")
    .in("profile_id", profileIds);
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    const missingColumn =
      error.code === "42703" || low.includes("column") || low.includes("does not exist");
    if (!missingColumn) throw new Error(error.message || "Impossible de charger les sports.");
    const fallback = await supabase
      .from("profile_sports")
      .select("profile_id, sports(id, label)")
      .in("profile_id", profileIds);
    if (fallback.error) throw new Error(fallback.error.message || "Impossible de charger les sports.");
    const out = new Map<string, SportCandidate[]>();
    for (const row of fallback.data ?? []) {
      const r = row as { profile_id?: string; sports?: { id?: string; label?: string | null } | null };
      if (!r.profile_id || !r.sports?.id) continue;
      const current = out.get(r.profile_id) ?? [];
      current.push({
        id: r.sports.id,
        label: (r.sports.label ?? "").trim() || "Sport",
      });
      out.set(r.profile_id, current);
    }
    return out;
  }
  const out = new Map<string, SportCandidate[]>();
  for (const row of data ?? []) {
    const r = row as {
      profile_id?: string;
      sports?: {
        id?: string;
        label?: string | null;
        active?: boolean | null;
        is_quick_date?: boolean | null;
        is_date_friendly?: boolean | null;
        is_featured?: boolean | null;
      } | null;
    };
    if (!r.profile_id || !r.sports?.id) continue;
    const current = out.get(r.profile_id) ?? [];
    current.push({
      id: r.sports.id,
      label: (r.sports.label ?? "").trim() || "Sport",
      active: r.sports.active ?? null,
      is_quick_date: r.sports.is_quick_date ?? null,
      is_date_friendly: r.sports.is_date_friendly ?? null,
      is_featured: r.sports.is_featured ?? null,
    });
    out.set(r.profile_id, current);
  }
  return out;
}

export async function createAutoProposalForMatchIfEligible(input: {
  conversationId: string;
  currentUserId: string;
}): Promise<ActivityProposal | null> {
  const coreReady = await verifyCoreTablesReady();
  if (!coreReady) return null;

  const { data: existing } = await supabase
    .from("activity_proposals")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .in("status", ["pending", "proposed", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) return null;

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, match_id")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (convErr || !conv?.match_id) return null;

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", conv.match_id)
    .maybeSingle();
  if (matchErr || !match?.user_a || !match?.user_b) return null;

  const myId = input.currentUserId;
  if (myId !== match.user_a && myId !== match.user_b) return null;
  const otherId = myId === match.user_a ? match.user_b : match.user_a;

  const sportsByProfile = await loadSportsForProfiles([myId, otherId]);
  const mine = sportsByProfile.get(myId) ?? [];
  const theirs = sportsByProfile.get(otherId) ?? [];
  if (mine.length === 0 || theirs.length === 0) return null;

  const theirById = new Map(theirs.map((s) => [s.id, s]));
  const common: SportCandidate[] = [];
  for (const s of mine) {
    if (!theirById.has(s.id)) continue;
    common.push(s);
  }
  const best = pickBestCommonSport(common);
  if (!best) return null;

  return createConversationProposal({
    conversationId: input.conversationId,
    proposerId: myId,
    matchId: match.id,
    sport: best.label,
    timeSlot: "À confirmer",
    location: null,
    note: null,
  });
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

export async function cancelConversationProposal(proposalId: string): Promise<ActivityProposal> {
  const { data, error } = await supabase
    .from("activity_proposals")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select(ACTIVITY_PROPOSAL_SELECT)
    .single();
  if (error) throw new Error(error.message || "Annulation impossible.");
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

