/**
 * Règles métier centralisées pour les actions sur les messages `activity_proposal`.
 * Utiliser ces fonctions pour l’UI (boutons) et pour revalider avant toute requête Supabase.
 */

import type { ActivityProposalPayloadV1 } from "./activityPayload";
import {
  activityProposalRowToPayloadV1,
  isActivityProposalClosed,
} from "./activityPayload";
import type { ActivityProposalRowLike } from "./messageTypes";

function norm(s: string | null | undefined): string {
  const x = (s ?? "pending").toLowerCase();
  if (x === "proposed") return "pending";
  return x;
}

export type ProposalRulesContext = {
  conversationReady: boolean;
  pairBlocked: boolean;
  currentUserId: string | null | undefined;
  proposal: ActivityProposalRowLike;
  payload: ActivityProposalPayloadV1;
  /** False → aucune action interactive (données insuffisantes / message non fiable). */
  dataReliable: boolean;
};

export type ProposalActionKind = "accept" | "decline" | "counter" | "cancel";

export type AvailableProposalActions = {
  accept: boolean;
  decline: boolean;
  counter: boolean;
  cancel: boolean;
};

/** Statut effectif : priorité au statut « fermant » côté payload, sinon ligne métier. */
export function getActivityProposalStatus(
  row: ActivityProposalRowLike,
  payload: ActivityProposalPayloadV1,
): string {
  const ps = norm(payload.status);
  const rs = norm(row.status ?? "");
  const closedPs = isActivityProposalClosed(ps);
  const closedRs = isActivityProposalClosed(rs);
  if (closedPs) return ps;
  if (closedRs) return rs;
  return ps || rs || "pending";
}

/**
 * Proposition considérée comme close pour l’UI / handlers (statut terminal ou incohérence répondue).
 */
export function isProposalClosed(payload: ActivityProposalPayloadV1, row: ActivityProposalRowLike): boolean {
  const st = getActivityProposalStatus(row, payload);
  if (isActivityProposalClosed(st)) return true;
  if (norm(st) === "pending") {
    if (payload.responded_by != null && String(payload.responded_by).trim() !== "") return true;
    if (payload.response != null && String(payload.response).trim() !== "") return true;
  }
  return false;
}

export function isProposalOwnedByCurrentUser(
  payload: ActivityProposalPayloadV1,
  currentUserId: string | null | undefined,
): boolean {
  if (!currentUserId) return false;
  return payload.created_by === currentUserId;
}

/** Identifiant présent + au moins un champ utile pour afficher la carte de façon fiable. */
export function isProposalDataReliable(proposal: ActivityProposalRowLike): boolean {
  const id = String(proposal.id ?? "").trim();
  if (!id) return false;
  const sport = (proposal.sport ?? "").trim();
  const time = (proposal.time_slot ?? "").trim();
  const loc = (proposal.location ?? "").trim();
  return sport.length > 0 || time.length > 0 || loc.length > 0;
}

function baseRecipientAllowed(ctx: ProposalRulesContext): boolean {
  if (!ctx.dataReliable) return false;
  if (!ctx.conversationReady || ctx.pairBlocked) return false;
  if (!ctx.currentUserId) return false;
  if (isProposalClosed(ctx.payload, ctx.proposal)) return false;
  if (isProposalOwnedByCurrentUser(ctx.payload, ctx.currentUserId)) return false;
  if (norm(getActivityProposalStatus(ctx.proposal, ctx.payload)) !== "pending") return false;
  return true;
}

export function canAcceptProposal(ctx: ProposalRulesContext): boolean {
  return baseRecipientAllowed(ctx);
}

export function canDeclineProposal(ctx: ProposalRulesContext): boolean {
  return baseRecipientAllowed(ctx);
}

export function canCounterProposal(ctx: ProposalRulesContext): boolean {
  return baseRecipientAllowed(ctx);
}

export function canCancelProposal(ctx: ProposalRulesContext): boolean {
  if (!ctx.dataReliable) return false;
  if (!ctx.conversationReady || ctx.pairBlocked) return false;
  if (!ctx.currentUserId) return false;
  if (isProposalClosed(ctx.payload, ctx.proposal)) return false;
  if (!isProposalOwnedByCurrentUser(ctx.payload, ctx.currentUserId)) return false;
  if (norm(getActivityProposalStatus(ctx.proposal, ctx.payload)) !== "pending") return false;
  return true;
}

export function getAvailableProposalActions(ctx: ProposalRulesContext): AvailableProposalActions {
  return {
    accept: canAcceptProposal(ctx),
    decline: canDeclineProposal(ctx),
    counter: canCounterProposal(ctx),
    cancel: canCancelProposal(ctx),
  };
}

/** Raison courte pour debug (dev) ou message utilisateur si action refusée. */
export function getBlockedActionReason(
  action: ProposalActionKind,
  ctx: ProposalRulesContext,
): string | null {
  if (!ctx.dataReliable) return "Données de proposition insuffisantes.";
  if (!ctx.conversationReady) return "Session non prête.";
  if (ctx.pairBlocked) return "Échange impossible avec ce profil.";
  if (!ctx.currentUserId) return "Non connecté.";

  const allowed =
    action === "accept"
      ? canAcceptProposal(ctx)
      : action === "decline"
        ? canDeclineProposal(ctx)
        : action === "counter"
          ? canCounterProposal(ctx)
          : canCancelProposal(ctx);
  if (allowed) return null;

  if (isProposalClosed(ctx.payload, ctx.proposal)) return "Cette proposition n’est plus modifiable.";

  if (action === "cancel") {
    if (!isProposalOwnedByCurrentUser(ctx.payload, ctx.currentUserId)) return "Seul l’auteur peut annuler.";
    return "Annulation impossible pour cet état.";
  }

  if (isProposalOwnedByCurrentUser(ctx.payload, ctx.currentUserId)) {
    return "Vous ne pouvez pas répondre à votre propre créneau.";
  }

  return "Action non autorisée.";
}

/** Contexte à partir d’une ligne fusionnée affichée dans le fil. */
export function buildProposalRulesContext(input: {
  proposal: ActivityProposalRowLike;
  currentUserId: string | null | undefined;
  conversationReady: boolean;
  pairBlocked: boolean;
}): ProposalRulesContext {
  const payload = activityProposalRowToPayloadV1(input.proposal);
  return {
    conversationReady: input.conversationReady,
    pairBlocked: input.pairBlocked,
    currentUserId: input.currentUserId,
    proposal: input.proposal,
    payload,
    dataReliable: isProposalDataReliable(input.proposal),
  };
}

/**
 * Revalidation immédiatement avant RPC ; ne remplace pas les garde-fous serveur.
 */
export function assertProposalActionAllowed(
  action: ProposalActionKind,
  ctx: ProposalRulesContext,
): { ok: true } | { ok: false; reason: string } {
  const reason = getBlockedActionReason(action, ctx);
  if (reason != null) return { ok: false, reason };
  return { ok: true };
}
