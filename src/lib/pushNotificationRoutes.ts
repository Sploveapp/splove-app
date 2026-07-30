import type { PushNotificationSchema } from "@capacitor/push-notifications";

export type PushNotificationKind =
  | "like"
  | "message"
  | "match"
  | "play_sent"
  | "activity_proposed"
  | "activity_counter"
  | "activity_accepted"
  | "meetup_confirmed";

const PUSH_KINDS = new Set<string>([
  "like",
  "message",
  "match",
  "play_sent",
  "activity_proposed",
  "activity_counter",
  "activity_accepted",
  "meetup_confirmed",
]);

export type PushNotificationPayload = {
  route: string | null;
  kind: PushNotificationKind | null;
  conversationId: string | null;
  profileId: string | null;
  actorId: string | null;
  proposalId: string | null;
  playType: string | null;
};

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readPushPayload(notification: PushNotificationSchema): PushNotificationPayload {
  const data = notification.data;
  if (!data || typeof data !== "object") {
    return {
      route: null,
      kind: null,
      conversationId: null,
      profileId: null,
      actorId: null,
      proposalId: null,
      playType: null,
    };
  }
  const record = data as Record<string, unknown>;
  const kindRaw = typeof record.kind === "string" ? record.kind : null;
  const kind = kindRaw && PUSH_KINDS.has(kindRaw) ? (kindRaw as PushNotificationKind) : null;
  const profileId =
    readString(record, "profileId") ?? readString(record, "actorId") ?? readString(record, "actor_id");
  return {
    route: readString(record, "route"),
    kind,
    conversationId: readString(record, "conversationId") ?? readString(record, "conversation_id"),
    profileId,
    actorId: readString(record, "actorId") ?? readString(record, "actor_id"),
    proposalId: readString(record, "proposalId") ?? readString(record, "proposal_id"),
    playType: readString(record, "playType") ?? readString(record, "play_type"),
  };
}

/** Ne pas traiter un push reçu au premier plan si l’utilisateur est déjà sur l’écran cible. */
export function shouldSuppressForegroundPush(
  pathname: string,
  payload: Pick<PushNotificationPayload, "route" | "kind" | "conversationId">,
): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (payload.kind === "like" && (path === "/likes-you" || path.startsWith("/likes-you/"))) {
    return true;
  }

  if (payload.kind === "play_sent" && (path === "/likes-you" || path.startsWith("/likes-you/"))) {
    return true;
  }

  if (
    (payload.kind === "message" ||
      payload.kind === "activity_proposed" ||
      payload.kind === "activity_counter" ||
      payload.kind === "activity_accepted") &&
    payload.conversationId
  ) {
    if (path === `/chat/${payload.conversationId}` || path.startsWith(`/chat/${payload.conversationId}/`)) {
      return true;
    }
  }

  if (payload.kind === "match" && payload.conversationId) {
    const matchPath = `/match/${payload.conversationId}`;
    if (path === matchPath || path.startsWith(`${matchPath}/`)) {
      return true;
    }
  }

  if (payload.kind === "meetup_confirmed") {
    if (path === "/mes-rencontres" || path.startsWith("/mes-rencontres/")) {
      return true;
    }
  }

  if (payload.route) {
    const target = payload.route.startsWith("/")
      ? payload.route.split("?")[0]!
      : `/${payload.route.split("?")[0]!}`;
    if (path === target || path.startsWith(`${target}/`)) {
      return true;
    }
  }

  return false;
}

export function resolvePushRoute(payload: PushNotificationPayload): string | null {
  if (payload.route) {
    return payload.route.startsWith("/") ? payload.route : `/${payload.route}`;
  }
  switch (payload.kind) {
    case "like":
    case "play_sent":
      return "/likes-you";
    case "message":
    case "activity_proposed":
    case "activity_counter":
    case "activity_accepted":
      return payload.conversationId ? `/chat/${payload.conversationId}` : "/messages";
    case "match":
      return payload.conversationId ? `/match/${payload.conversationId}` : "/messages";
    case "meetup_confirmed":
      return "/mes-rencontres?tab=confirmed";
    default:
      return null;
  }
}
