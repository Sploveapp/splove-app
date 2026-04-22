import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MESSAGES_TABLE } from "../supabase";
import { buildInitialActivityProposalPayload, buildUpdatedActivityProposalPayload } from "./activityPayload";
import { buildMetadataPayloadForInsert } from "./activityProposal";
import type { ActivityProposalRowLike } from "./messageTypes";

export type ActivityMutationError = {
  code: "forbidden" | "rpc" | "message" | "unknown";
  message: string;
};

/**
 * Payload pour `supabase.rpc("create_activity_proposal", …)` — aligné sur les migrations repo :
 * `051` : (p_conversation_id, p_sport, p_time_slot, p_location, p_note default null)
 * `061` : + p_scheduled_at optionnel (ne pas l’envoyer tant que des déploiements 051 existent).
 *
 * On n’envoie **pas** de clés undefined / null : `p_note` est omis si vide (défaut SQL).
 */
export function buildCreateActivityProposalRpcArgs(args: {
  conversationId: string;
  sport: string;
  timeSlot: string;
  location: string;
  note: string | null | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {
    p_conversation_id: args.conversationId,
    p_sport: args.sport.trim(),
    p_time_slot: args.timeSlot.trim(),
    p_location: args.location.trim() || "À définir",
  };
  const note = typeof args.note === "string" ? args.note.trim() : "";
  if (note.length > 0) {
    out.p_note = note;
  }
  return out;
}

/** Best-effort : aligne `messages.metadata` sur `activity_proposals` (RPC migration 055). */
async function syncProposalMessageMetadata(client: SupabaseClient, proposalId: string): Promise<void> {
  const { error } = await client.rpc("sync_activity_proposal_message_metadata", {
    p_proposal_id: proposalId,
  });
  if (error) {
    console.warn("[activityProposalMutations] sync metadata (non bloquant)", error);
  }
}

/** Fusionne un patch dans `messages.payload` (RPC migration 056). */
async function patchActivityProposalSourcePayload(
  client: SupabaseClient,
  args: {
    conversationId: string;
    activityProposalId: string;
    patch: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await client.rpc("patch_activity_proposal_source_message_payload", {
    p_conversation_id: args.conversationId,
    p_activity_proposal_id: args.activityProposalId,
    p_patch: args.patch,
  });
  if (error) {
    console.warn("[activityProposalMutations] patch payload (non bloquant)", error);
  }
}

export async function acceptActivityProposal(
  client: SupabaseClient,
  args: { proposalId: string; conversationId: string; currentUserId: string },
): Promise<{ data: ActivityProposalRowLike } | { error: ActivityMutationError }> {
  const { data, error } = await client.rpc("respond_to_activity_proposal", {
    p_proposal_id: args.proposalId,
    p_action: "accepted",
  });
  if (error) {
    return { error: { code: "rpc", message: error.message ?? "Réponse impossible." } };
  }
  const row = data as ActivityProposalRowLike | null;
  if (!row) {
    return {
      error: {
        code: "forbidden",
        message: "Cette proposition n’est plus modifiable ou a déjà été traitée.",
      },
    };
  }
  await syncProposalMessageMetadata(client, args.proposalId);

  await patchActivityProposalSourcePayload(client, {
    conversationId: args.conversationId,
    activityProposalId: args.proposalId,
    patch: buildUpdatedActivityProposalPayload("accepted", args.currentUserId),
  });

  const { error: insErr } = await client.from(CHAT_MESSAGES_TABLE).insert({
    conversation_id: args.conversationId,
    sender_id: args.currentUserId,
    body: "✅ Créneau accepté",
    message_type: "activity_proposal_response",
    activity_proposal_id: args.proposalId,
    metadata: { response: "accepted" },
    payload: { response: "accepted" },
  });
  if (insErr) {
    console.error("[acceptActivityProposal] response message (non bloquant)", insErr);
  }

  return { data: row };
}

export async function declineActivityProposal(
  client: SupabaseClient,
  args: { proposalId: string; conversationId: string; currentUserId: string },
): Promise<{ data: ActivityProposalRowLike } | { error: ActivityMutationError }> {
  const { data, error } = await client.rpc("respond_to_activity_proposal", {
    p_proposal_id: args.proposalId,
    p_action: "declined",
  });
  if (error) {
    return { error: { code: "rpc", message: error.message ?? "Réponse impossible." } };
  }
  const row = data as ActivityProposalRowLike | null;
  if (!row) {
    return {
      error: {
        code: "forbidden",
        message: "Cette proposition n’est plus modifiable ou a déjà été traitée.",
      },
    };
  }
  await syncProposalMessageMetadata(client, args.proposalId);

  await patchActivityProposalSourcePayload(client, {
    conversationId: args.conversationId,
    activityProposalId: args.proposalId,
    patch: buildUpdatedActivityProposalPayload("declined", args.currentUserId),
  });

  const { error: insErr } = await client.from(CHAT_MESSAGES_TABLE).insert({
    conversation_id: args.conversationId,
    sender_id: args.currentUserId,
    body: "❌ Créneau refusé",
    message_type: "activity_proposal_response",
    activity_proposal_id: args.proposalId,
    metadata: { response: "declined" },
    payload: { response: "declined" },
  });
  if (insErr) {
    console.error("[declineActivityProposal] response message (non bloquant)", insErr);
  }

  return { data: row };
}

export async function cancelActivityProposal(
  client: SupabaseClient,
  args: { proposalId: string },
): Promise<{ data: ActivityProposalRowLike } | { error: ActivityMutationError }> {
  const { data, error } = await client.rpc("cancel_activity_proposal", {
    p_proposal_id: args.proposalId,
  });
  if (error) {
    return { error: { code: "rpc", message: error.message ?? "Annulation impossible." } };
  }
  const row = data as ActivityProposalRowLike | null;
  if (!row) {
    return { error: { code: "forbidden", message: "Ce créneau n’est plus annulable." } };
  }
  await syncProposalMessageMetadata(client, args.proposalId);

  await patchActivityProposalSourcePayload(client, {
    conversationId: row.conversation_id,
    activityProposalId: args.proposalId,
    patch: buildUpdatedActivityProposalPayload("cancelled", row.proposer_id),
  });

  return { data: row };
}

/** Contre-proposition : RPC `respond_to_activity_proposal` avec action countered + message fil chat. */
export async function createCounterProposal(
  client: SupabaseClient,
  args: {
    replaceProposalId: string;
    conversationId: string;
    currentUserId: string;
    sport: string;
    timeSlot: string;
    location: string;
    note: string | null;
    scheduledAt: string | null;
  },
): Promise<{ data: ActivityProposalRowLike } | { error: ActivityMutationError }> {
  /** Pas de `p_scheduled_at` côté RPC sur les BDD alignées 051/052 — la date est portée par le message / métadonnées. */
  const { data, error } = await client.rpc("respond_to_activity_proposal", {
    p_proposal_id: args.replaceProposalId,
    p_action: "reschedule_requested",
    p_time_slot: args.timeSlot,
    p_location: args.location,
    p_note: args.note,
    p_sport: args.sport,
  });
  if (error) {
    return { error: { code: "rpc", message: error.message ?? "Contre-proposition impossible." } };
  }
  const row = data as ActivityProposalRowLike | null;
  if (!row) {
    return {
      error: {
        code: "forbidden",
        message: "Impossible de créer la contre-proposition.",
      },
    };
  }
  await syncProposalMessageMetadata(client, args.replaceProposalId);

  await patchActivityProposalSourcePayload(client, {
    conversationId: args.conversationId,
    activityProposalId: args.replaceProposalId,
    patch: buildUpdatedActivityProposalPayload("reschedule_requested", args.currentUserId, {
      counterProposal: {
        sport: args.sport,
        time: args.timeSlot,
        location: args.location,
        note: args.note,
      },
    }),
  });

  const userLine = args.note?.trim() || "";
  const body = userLine.length > 0 ? userLine : "Ça te dit ?";
  const meta = buildMetadataPayloadForInsert({
    sport: args.sport,
    location: args.location,
    timeLabel: args.timeSlot,
    proposerId: args.currentUserId,
    userNote: userLine || null,
  });
  const initialPayload = buildInitialActivityProposalPayload({
    sport: args.sport,
    location: args.location,
    timeLabel: args.timeSlot,
    createdBy: args.currentUserId,
    userNote: userLine || null,
  });

  const { error: insErr } = await client.from(CHAT_MESSAGES_TABLE).insert({
    conversation_id: args.conversationId,
    sender_id: args.currentUserId,
    body,
    message_type: "activity_proposal",
    activity_proposal_id: row.id,
    metadata: meta,
    payload: initialPayload,
  });
  if (insErr) {
    return { error: { code: "message", message: insErr.message ?? "Message non enregistré." } };
  }

  await syncProposalMessageMetadata(client, row.id);

  return { data: row };
}

/** Alias métier explicite anti-ghosting: "reschedule requested". */
export const requestProposalReschedule = createCounterProposal;

/** Première proposition (pas de remplacement) : RPC create + message court + sync metadata. */
export async function createPendingActivityProposal(
  client: SupabaseClient,
  args: {
    conversationId: string;
    currentUserId: string;
    sport: string;
    timeSlot: string;
    location: string;
    note: string | null;
    scheduledAt: string | null;
  },
): Promise<{ data: ActivityProposalRowLike } | { error: ActivityMutationError }> {
  const { data, error } = await client.rpc(
    "create_activity_proposal",
    buildCreateActivityProposalRpcArgs({
      conversationId: args.conversationId,
      sport: args.sport,
      timeSlot: args.timeSlot,
      location: args.location,
      note: args.note,
    }),
  );
  if (error) {
    return { error: { code: "rpc", message: error.message ?? "Création impossible." } };
  }
  const row = data as ActivityProposalRowLike | null;
  if (!row) {
    return { error: { code: "unknown", message: "Impossible de créer la proposition." } };
  }

  const userLine = args.note?.trim() || "";
  const body = userLine.length > 0 ? userLine : "Ça te dit ?";
  const meta = buildMetadataPayloadForInsert({
    sport: args.sport,
    location: args.location,
    timeLabel: args.timeSlot,
    proposerId: args.currentUserId,
    userNote: userLine || null,
  });
  const initialPayload = buildInitialActivityProposalPayload({
    sport: args.sport,
    location: args.location,
    timeLabel: args.timeSlot,
    createdBy: args.currentUserId,
    userNote: userLine || null,
  });

  const { error: insErr } = await client.from(CHAT_MESSAGES_TABLE).insert({
    conversation_id: args.conversationId,
    sender_id: args.currentUserId,
    body,
    message_type: "activity_proposal",
    activity_proposal_id: row.id,
    metadata: meta,
    payload: initialPayload,
  });
  if (insErr) {
    return { error: { code: "message", message: insErr.message ?? "Message non enregistré." } };
  }

  await syncProposalMessageMetadata(client, row.id);

  return { data: row };
}
