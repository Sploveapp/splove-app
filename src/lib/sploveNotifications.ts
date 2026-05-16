import type { InAppNotificationRow } from "../services/inAppNotifications.service";

export type SploveNotificationPayload = {
  route?: string;
  actor_id?: string;
  actor_name?: string;
  actor_avatar?: string;
  conversation_id?: string;
  match_id?: string;
  proposal_id?: string;
  sport?: string;
  place?: string;
  location?: string;
  scheduled_at?: string;
};

const SOCIAL_KINDS = new Set([
  "new_like",
  "new_match",
  "new_message",
  "activity_proposed",
  "activity_accepted",
  "activity_counter",
  "meetup_confirmed",
  "activity_reminder",
]);

export function parseNotificationPayload(raw: unknown): SploveNotificationPayload {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: SploveNotificationPayload = {};
  if (typeof o.route === "string" && o.route.trim()) out.route = o.route.trim();
  if (typeof o.actor_id === "string") out.actor_id = o.actor_id;
  if (typeof o.actor_name === "string") out.actor_name = o.actor_name.trim();
  if (typeof o.actor_avatar === "string") out.actor_avatar = o.actor_avatar.trim();
  if (typeof o.conversation_id === "string") out.conversation_id = o.conversation_id;
  if (typeof o.match_id === "string") out.match_id = o.match_id;
  if (typeof o.proposal_id === "string") out.proposal_id = o.proposal_id;
  if (typeof o.sport === "string") out.sport = o.sport.trim();
  if (typeof o.place === "string") out.place = o.place.trim();
  if (typeof o.location === "string") out.location = o.location.trim();
  if (typeof o.scheduled_at === "string") out.scheduled_at = o.scheduled_at;
  return out;
}

export function isSocialNotificationKind(kind: string): boolean {
  return SOCIAL_KINDS.has(kind);
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function resolveNotificationRoute(
  kind: string,
  payload: SploveNotificationPayload,
): string {
  if (payload.route) return payload.route.startsWith("/") ? payload.route : `/${payload.route}`;
  switch (kind) {
    case "new_like":
      return "/likes-you";
    case "new_match":
      return payload.conversation_id ? `/match/${payload.conversation_id}` : "/messages";
    case "new_message":
    case "activity_proposed":
    case "activity_accepted":
    case "activity_counter":
    case "activity_reminder":
      return payload.conversation_id ? `/chat/${payload.conversation_id}` : "/messages";
    case "meetup_confirmed":
      return "/mes-rencontres?tab=confirmed";
    default:
      return "/discover";
  }
}

export type NotificationPresentation = {
  emoji: string;
  line: string;
  subtitle: string | null;
  route: string;
  isSocial: boolean;
  actorId: string | null;
  actorAvatarUrl: string | null;
};

const KIND_EMOJI: Record<string, string> = {
  new_like: "💛",
  new_match: "❤️",
  new_message: "💬",
  activity_proposed: "⛰️",
  activity_accepted: "🎯",
  activity_counter: "🔄",
  meetup_confirmed: "📍",
  activity_reminder: "⏰",
  invite_link_sent_delay: "✉️",
  invite_followup_day1: "👋",
  referrer_zone_unlocked: "🎁",
  discover_low_engagement_48h: "🔍",
};

export function presentNotification(
  row: InAppNotificationRow,
  t: (key: string) => string,
): NotificationPresentation {
  const payload = parseNotificationPayload(row.payload);
  const route = resolveNotificationRoute(row.kind, payload);
  const name = payload.actor_name?.trim() || t("in_app_notif.someone");
  const sport = payload.sport?.trim() || t("activity_default_sport");
  const place =
    payload.place?.trim() || payload.location?.trim() || t("place_to_define");

  const socialKey = `in_app_notif.social.${row.kind}`;
  const socialTemplate = t(socialKey);
  if (isSocialNotificationKind(row.kind) && socialTemplate && socialTemplate !== socialKey) {
    return {
      emoji: KIND_EMOJI[row.kind] ?? "🔔",
      line: applyTemplate(socialTemplate, { name, sport, place }),
      subtitle: null,
      route,
      isSocial: true,
      actorId: payload.actor_id ?? null,
      actorAvatarUrl: payload.actor_avatar?.trim() || null,
    };
  }

  const legacy = legacyLinesForKind(t, row.kind);
  return {
    emoji: KIND_EMOJI[row.kind] ?? "🔔",
    line: legacy.title,
    subtitle: legacy.message || null,
    route,
    isSocial: false,
    actorId: payload.actor_id ?? null,
    actorAvatarUrl: payload.actor_avatar?.trim() || null,
  };
}

/** Masque les notifs chat (Phase 1 : cloche ≠ Messages). */
export function isBellCenterNotificationRow(row: { kind: string }): boolean {
  return row.kind !== "new_message";
}

function legacyLinesForKind(
  t: (key: string) => string,
  kind: string,
): { title: string; message: string } {
  const map: Record<string, { titleKey: string; messageKey: string }> = {
    invite_link_sent_delay: {
      titleKey: "in_app_notif.invite_link_sent_delay.title",
      messageKey: "in_app_notif.invite_link_sent_delay.message",
    },
    invite_followup_day1: {
      titleKey: "in_app_notif.invite_followup_day1.title",
      messageKey: "in_app_notif.invite_followup_day1.message",
    },
    referrer_zone_unlocked: {
      titleKey: "in_app_notif.referrer_zone_unlocked.title",
      messageKey: "in_app_notif.referrer_zone_unlocked.message",
    },
    discover_low_engagement_48h: {
      titleKey: "in_app_notif.discover_low_engagement_48h.title",
      messageKey: "in_app_notif.discover_low_engagement_48h.message",
    },
  };
  const keys = map[kind];
  if (!keys) return { title: kind, message: "" };
  return { title: t(keys.titleKey), message: t(keys.messageKey) };
}

/** Non lues d’abord, puis plus récentes. */
export function sortNotifications(rows: InAppNotificationRow[]): InAppNotificationRow[] {
  return [...rows].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
