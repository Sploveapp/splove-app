import {
  BELL_NOTIFICATION_KINDS,
  type InAppNotificationRow,
} from "../services/inAppNotifications.service";
import {
  SPLOVE_PLAY_META,
  formatPlaySentNotificationLine,
  resolveSplovePlayType,
} from "./splovePlay";

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
  /** Horodatage source de l'événement (backfill client). */
  event_at?: string;
  /** SPLove Play (`play_sent`). */
  play_type?: string;
};

const SOCIAL_KINDS = new Set([
  "new_like",
  "new_match",
  "new_message",
  "play_sent",
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
  if (typeof o.event_at === "string" && o.event_at.trim()) out.event_at = o.event_at.trim();
  if (typeof o.play_type === "string" && o.play_type.trim()) out.play_type = o.play_type.trim();
  return out;
}

function likesYouRoute(actorId: string | undefined): string {
  if (actorId?.trim()) return `/likes-you?liker=${encodeURIComponent(actorId.trim())}`;
  return "/likes-you";
}

/** Timestamp d'affichage : event_at (source) puis created_at (insertion). */
export function notificationDisplayTimestamp(row: InAppNotificationRow): string {
  const payload = parseNotificationPayload(row.payload);
  const eventAt = payload.event_at?.trim();
  if (eventAt) return eventAt;
  return row.created_at;
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
  if (payload.route) {
    const base = payload.route.startsWith("/") ? payload.route : `/${payload.route}`;
    if ((kind === "new_like" || kind === "play_sent") && payload.actor_id?.trim()) {
      const pathOnly = base.split("?")[0];
      if (pathOnly === "/likes-you") {
        return likesYouRoute(payload.actor_id);
      }
    }
    return base;
  }
  switch (kind) {
    case "new_like":
    case "play_sent":
      return likesYouRoute(payload.actor_id);
    case "new_match":
      return payload.conversation_id ? `/match/${payload.conversation_id}` : "/messages";
    case "new_message":
      return payload.conversation_id ? `/chat/${payload.conversation_id}` : "/messages";
    case "activity_proposed":
    case "activity_counter":
      if (payload.conversation_id) return `/chat/${payload.conversation_id}`;
      if (payload.proposal_id) return `/mes-rencontres?tab=to_confirm`;
      return "/mes-rencontres?tab=to_confirm";
    case "activity_accepted":
    case "activity_reminder":
      return payload.conversation_id ? `/chat/${payload.conversation_id}` : "/mes-rencontres";
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
  /** Si true, n’affiche pas l’emoji en préfixe de ligne (déjà dans `line`). */
  omitLineEmoji?: boolean;
};

const KIND_EMOJI: Record<string, string> = {
  new_like: "💛",
  play_sent: "❤️",
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

  if (row.kind === "play_sent") {
    const play = resolveSplovePlayType(payload.play_type);
    const meta = SPLOVE_PLAY_META[play];
    return {
      emoji: meta.emoji,
      line: formatPlaySentNotificationLine(t, play, name),
      subtitle: null,
      route,
      isSocial: true,
      actorId: payload.actor_id ?? null,
      actorAvatarUrl: payload.actor_avatar?.trim() || null,
      omitLineEmoji: true,
    };
  }

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

/** Lignes affichées dans le centre cloche (kinds produit). */
export function isBellCenterNotificationRow(row: { kind: string }): boolean {
  return (BELL_NOTIFICATION_KINDS as readonly string[]).includes(row.kind);
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

import { parseSupabaseTimestamp } from "./parseSupabaseTimestamp";

/** Plus récent → plus ancien. */
export function sortNotifications(rows: InAppNotificationRow[]): InAppNotificationRow[] {
  return [...rows].sort((a, b) => {
    const tb = parseSupabaseTimestamp(notificationDisplayTimestamp(b));
    const ta = parseSupabaseTimestamp(notificationDisplayTimestamp(a));
    return tb - ta;
  });
}
