import type {
  ActivityProposalMessagePayload,
  ActivityProposalRowLike,
  ActivityProposalStatus,
} from "./messageTypes";
import {
  buildInitialActivityProposalPayload,
  parseActivityProposalPayload as parseActivityProposalPayloadV1,
} from "./activityPayload";
import { buildProposalRulesContext, getAvailableProposalActions } from "./activityProposalRules";

export function normalizeActivityProposalStatus(raw: string | null | undefined): string {
  const s = (raw ?? "pending").toLowerCase();
  if (s === "proposed") return "pending";
  if (s === "counter_proposed") return "reschedule_requested";
  if (s === "countered") return "reschedule_requested";
  if (s === "alternative_requested" || s === "replaced") return "reschedule_requested";
  return s;
}

export function isTerminalProposalStatus(status: string): boolean {
  const s = normalizeActivityProposalStatus(status);
  return (
    s === "accepted" ||
    s === "declined" ||
    s === "cancelled" ||
    s === "expired" ||
    s === "reschedule_requested" ||
    s === "countered" ||
    s === "replaced"
  );
}

export function isPendingProposalStatus(status: string | null | undefined): boolean {
  const s = normalizeActivityProposalStatus(status);
  return s === "pending";
}

/**
 * Parse un metadata / payload JSON — champs partiels tolérés (compat `ActivityProposalMessagePayload`).
 */
export function parseActivityProposalPayload(raw: unknown): Partial<ActivityProposalMessagePayload> | null {
  const p = parseActivityProposalPayloadV1(raw);
  if (!p) return null;
  const proposerId = (p.created_by ?? "").trim();
  const out: Partial<ActivityProposalMessagePayload> = {
    sport: p.sport,
    location: p.location,
    time: p.time,
    status: p.status as ActivityProposalStatus | string,
    responded_by: p.responded_by,
    responded_at: p.responded_at,
    user_note: p.user_note,
  };
  if (proposerId.length > 0) out.proposer_id = proposerId;
  return out;
}

export function mergeProposalRowWithPayload(
  row: ActivityProposalRowLike,
  meta: Partial<ActivityProposalMessagePayload> | null,
): ActivityProposalRowLike {
  if (!meta) return row;
  const noteFromMeta =
    meta.user_note != null && meta.user_note.trim().length > 0 ? meta.user_note.trim() : undefined;
  return {
    ...row,
    sport: meta.sport ?? row.sport,
    location: meta.location ?? row.location,
    time_slot: meta.time ?? row.time_slot,
    status: meta.status ?? row.status,
    responded_by: meta.responded_by ?? row.responded_by,
    responded_at: meta.responded_at ?? row.responded_at,
    note: noteFromMeta ?? row.note,
  };
}

export function buildMetadataPayloadForInsert(input: {
  sport: string;
  location: string;
  timeLabel: string;
  proposerId: string;
  userNote: string | null;
}): Record<string, unknown> {
  const v1 = buildInitialActivityProposalPayload({
    sport: input.sport,
    location: input.location,
    timeLabel: input.timeLabel,
    createdBy: input.proposerId,
    userNote: input.userNote,
  });
  return {
    ...v1,
    proposer_id: input.proposerId,
    sport_label: input.sport.trim(),
    location_label: input.location.trim(),
    scheduled_at_label: input.timeLabel.trim(),
  };
}

export type ProposalActionVisibility = {
  showRecipientActions: boolean;
  showProposerCancel: boolean;
};

export function getProposalActionVisibility(input: {
  proposal: ActivityProposalRowLike;
  currentUserId: string | null | undefined;
  conversationReady: boolean;
  pairBlocked?: boolean;
}): ProposalActionVisibility {
  const ctx = buildProposalRulesContext({
    proposal: input.proposal,
    currentUserId: input.currentUserId,
    conversationReady: input.conversationReady,
    pairBlocked: input.pairBlocked ?? false,
  });
  const av = getAvailableProposalActions(ctx);
  return {
    showRecipientActions: av.accept || av.decline || av.counter,
    showProposerCancel: av.cancel,
  };
}

export function proposalPayloadFromRow(row: ActivityProposalRowLike): ActivityProposalMessagePayload {
  return {
    sport: row.sport?.trim() || "Activité",
    location: row.location?.trim() || "—",
    time: row.time_slot?.trim() || "Créneau à confirmer",
    status: normalizeActivityProposalStatus(row.status) as ActivityProposalStatus,
    proposer_id: row.proposer_id,
    responded_by: row.responded_by ?? null,
    responded_at: row.responded_at ?? null,
    user_note: row.note?.trim() || null,
  };
}

/** Ligne courte « Sport • Lieu • Dim. 18h30 » pour la carte rendez-vous confirmé. */
export function formatCompactConfirmedActivityDetail(
  row: ActivityProposalRowLike,
  locale: string,
  slotPendingLabel: string,
  meetup?: { sport?: string; location?: string; date?: string; time?: string } | null,
): string {
  const sport = meetup?.sport?.trim() || row.sport?.trim() || "—";
  const place =
    meetup?.location?.trim() ||
    row.location?.trim() ||
    (row as { place?: string | null }).place?.trim() ||
    "—";

  let when = "";
  if (meetup?.date && meetup?.time) {
    const d = new Date(`${meetup.date}T${meetup.time}`);
    if (!Number.isNaN(d.getTime())) {
      when = d.toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
    } else {
      when = `${meetup.date} ${meetup.time}`;
    }
  }
  if (!when) {
    const full = formatPlannedActivityWhen(row, locale, slotPendingLabel);
    const comma = full.indexOf(",");
    when =
      comma > 0
        ? full.slice(0, comma).trim() +
          " " +
          full
            .slice(comma + 1)
            .replace(/^[\s,]+/, "")
            .trim()
        : full;
  }

  return `${sport} • ${place} • ${when}`;
}

/** Libellé date/heure pour une activité confirmée (chat, bannière unique). */
export function formatPlannedActivityWhen(
  row: ActivityProposalRowLike,
  locale: string,
  slotPendingLabel: string,
): string {
  if (row.scheduled_at) {
    try {
      const d = new Date(row.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
      }
    } catch {
      /* ignore */
    }
  }
  const slot = row.time_slot?.trim();
  return slot && slot.length > 0 ? slot : slotPendingLabel;
}

export function statusBadgeLabel(
  status: string,
  tr: (key: string) => string,
): { text: string; tone: "success" | "danger" | "warning" | "muted" } | null {
  const s = normalizeActivityProposalStatus(status);
  if (s === "accepted") return { text: tr("activity_badge_slot_confirmed"), tone: "success" };
  if (s === "declined") return { text: tr("activity_badge_slot_refused"), tone: "danger" };
  if (s === "reschedule_requested" || s === "countered" || s === "replaced") {
    return { text: tr("activity_badge_reschedule"), tone: "warning" };
  }
  if (s === "cancelled") return { text: tr("activity_badge_cancelled"), tone: "muted" };
  if (s === "expired") return { text: tr("activity_badge_expired"), tone: "muted" };
  return null;
}

