/**
 * Détection et normalisation des messages structurés (affichage fil de conversation).
 * Source de champs : `metadata` JSONB (et optionnellement `payload` côté client si ajouté plus tard).
 */

import type { ActivityProposalRowLike } from "./messageTypes";
import {
  mergeMessagePayloadLayers,
  normalizeActivityProposalPayloadForDisplay,
  toLegacyMessagePayloadPartial,
} from "./activityPayload";
import {
  mergeProposalRowWithPayload,
  normalizeActivityProposalStatus,
} from "./activityProposal";

/** Aligné sur les lignes chargées depuis `messages` dans Chat. */
export type ChatMessageInput = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  message_type?: string | null;
  activity_proposal_id?: string | null;
  metadata?: unknown;
  /** Réservé si une colonne `payload` est ajoutée ; sinon ignoré. */
  payload?: unknown;
};

export type ParsedActivityProposal = {
  proposalId: string;
  sport: string;
  location: string;
  time: string;
  status: string;
  proposerId: string;
  userNote: string | null;
  scheduledAtIso: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
};

export type ParsedActivityResponseKind =
  | "accepted"
  | "declined"
  | "countered"
  | "cancelled"
  | "expired"
  | "unknown";

export type ParsedActivityResponse = {
  kind: ParsedActivityResponseKind;
  /** Texte affiché (compact, une ligne). */
  displayLabel: string;
};

/** Union descriptive pour documentation / futurs refactors du renderer. */
export type ConversationRenderableMessage =
  | { variant: "text"; message: ChatMessageInput }
  | { variant: "activity_proposal"; parsed: ParsedActivityProposal; row: ActivityProposalRowLike }
  | { variant: "activity_response"; parsed: ParsedActivityResponse; message: ChatMessageInput };

const ACTIVITY_PROPOSAL_TYPE = "activity_proposal";
const ACTIVITY_RESPONSE_TYPE = "activity_proposal_response";

export function isActivityProposalMessage(msg: {
  message_type?: string | null;
  activity_proposal_id?: string | null;
}): boolean {
  return (msg.message_type ?? "text") === ACTIVITY_PROPOSAL_TYPE && Boolean(String(msg.activity_proposal_id ?? "").trim());
}

export function isActivityResponseMessage(msg: { message_type?: string | null }): boolean {
  return (msg.message_type ?? "text") === ACTIVITY_RESPONSE_TYPE;
}

function hasMinimalProposalContent(row: ActivityProposalRowLike): boolean {
  const s = (row.sport ?? "").trim();
  const t = (row.time_slot ?? "").trim();
  const l = (row.location ?? "").trim();
  return s.length > 0 || t.length > 0 || l.length > 0;
}

function rowToParsed(row: ActivityProposalRowLike): ParsedActivityProposal {
  return {
    proposalId: row.id,
    sport: row.sport?.trim() ?? "",
    location: row.location?.trim() ?? "",
    time: row.time_slot?.trim() ?? "",
    status: normalizeActivityProposalStatus(row.status),
    proposerId: row.proposer_id,
    userNote: row.note?.trim() ?? null,
    scheduledAtIso: row.scheduled_at ?? null,
    respondedBy: row.responded_by ?? null,
    respondedAt: row.responded_at ?? null,
  };
}

/**
 * Construit la ligne « carte activité » pour le rendu, ou `null` si données insuffisantes
 * → le caller affiche le message comme texte brut (`body`).
 */
export function buildActivityProposalRowForRender(
  msg: ChatMessageInput,
  conversationId: string,
  fromDb: ActivityProposalRowLike | undefined,
): ActivityProposalRowLike | null {
  if (!isActivityProposalMessage(msg)) return null;
  const pid = String(msg.activity_proposal_id ?? "").trim();
  if (!pid) return null;

  const mergedLayers = mergeMessagePayloadLayers(msg);
  const normalized = normalizeActivityProposalPayloadForDisplay(mergedLayers, msg.sender_id);
  const partial = toLegacyMessagePayloadPartial(normalized);

  if (fromDb) {
    const merged = mergeProposalRowWithPayload(fromDb, partial) as ActivityProposalRowLike;
    return hasMinimalProposalContent(merged) ? merged : null;
  }

  const fallback: ActivityProposalRowLike = {
    id: pid,
    conversation_id: conversationId,
    proposer_id: partial.proposer_id ?? msg.sender_id,
    sport: partial.sport?.trim() ?? "",
    place: null,
    time_slot: partial.time?.trim() ?? "",
    location: partial.location != null ? partial.location : null,
    note: partial.user_note ?? null,
    created_at: msg.created_at,
    status: typeof partial.status === "string" ? partial.status : "pending",
    scheduled_at: null,
    boost_awarded: null,
    supersedes_proposal_id: null,
    responded_by: partial.responded_by ?? null,
    responded_at: partial.responded_at ?? null,
  };

  const merged = mergeProposalRowWithPayload(fallback, partial) as ActivityProposalRowLike;
  return hasMinimalProposalContent(merged) ? merged : null;
}

export function parseActivityProposal(
  msg: ChatMessageInput,
  conversationId: string,
  enrichment: ActivityProposalRowLike | undefined,
): ParsedActivityProposal | null {
  const row = buildActivityProposalRowForRender(msg, conversationId, enrichment);
  if (!row) return null;
  return rowToParsed(row);
}

/** Libellé court pour badge / accessibilité selon statut normalisé. */
export function getActivityStatusLabel(status: string): string {
  const s = normalizeActivityProposalStatus(status);
  switch (s) {
    case "pending":
      return "En attente de réponse";
    case "accepted":
      return "Créneau confirmé";
    case "declined":
      return "Créneau refusé";
    case "countered":
    case "replaced":
      return "Contre-proposition envoyée";
    case "cancelled":
      return "Proposition annulée";
    case "expired":
      return "Proposition expirée";
    default:
      return status.trim() || "Proposition";
  }
}

function normalizeResponseToken(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase();
}

/**
 * Déduit le libellé système à partir de `metadata.response` et du corps du message.
 */
export function parseActivityResponse(msg: ChatMessageInput): ParsedActivityResponse {
  const body = (msg.body ?? "").trim();
  let meta: Record<string, unknown> = {};
  try {
    if (msg.metadata != null && typeof msg.metadata === "object" && msg.metadata !== null) {
      meta = msg.metadata as Record<string, unknown>;
    }
  } catch {
    meta = {};
  }
  const layer = mergeMessagePayloadLayers(msg);
  const response = normalizeResponseToken(layer?.response ?? meta.response ?? meta.kind);

  if (response === "accepted" || response === "accept") {
    return { kind: "accepted", displayLabel: "✅ Créneau accepté" };
  }
  if (response === "declined" || response === "decline" || response === "refused") {
    return { kind: "declined", displayLabel: "❌ Créneau refusé" };
  }
  if (response === "countered" || response === "counter") {
    return { kind: "countered", displayLabel: "🔁 Contre-proposition envoyée" };
  }
  if (response === "cancelled" || response === "canceled") {
    return { kind: "cancelled", displayLabel: "🚫 Proposition annulée" };
  }
  if (response === "expired") {
    return { kind: "expired", displayLabel: "⌛ Proposition expirée" };
  }

  // Heuristiques sur le texte si metadata absente ou inconnue
  if (/✅|accepté|acceptée|ok pour moi/i.test(body)) {
    return { kind: "accepted", displayLabel: "✅ Créneau accepté" };
  }
  if (/❌|refusé|refusée|pas dispo|créneau refusé/i.test(body)) {
    return { kind: "declined", displayLabel: "❌ Créneau refusé" };
  }
  if (/🔁|contre-proposition|autre créneau/i.test(body)) {
    return { kind: "countered", displayLabel: "🔁 Contre-proposition envoyée" };
  }
  if (/annul|cancel/i.test(body)) {
    return { kind: "cancelled", displayLabel: "🚫 Proposition annulée" };
  }

  if (body.length > 0) {
    return { kind: "unknown", displayLabel: body };
  }
  return { kind: "unknown", displayLabel: "Mise à jour" };
}
