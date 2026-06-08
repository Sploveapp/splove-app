import type { PushNotificationSchema } from "@capacitor/push-notifications";

export type PushNotificationKind = "like" | "message" | "match";

export function readPushPayload(notification: PushNotificationSchema): {
  route: string | null;
  kind: PushNotificationKind | null;
  conversationId: string | null;
} {
  const data = notification.data;
  if (!data || typeof data !== "object") {
    return { route: null, kind: null, conversationId: null };
  }
  const record = data as Record<string, unknown>;
  const route = typeof record.route === "string" && record.route.trim() ? record.route.trim() : null;
  const kindRaw = typeof record.kind === "string" ? record.kind : null;
  const kind =
    kindRaw === "like" || kindRaw === "message" || kindRaw === "match" ? kindRaw : null;
  const conversationId =
    typeof record.conversationId === "string" && record.conversationId.trim()
      ? record.conversationId.trim()
      : null;
  return { route, kind, conversationId };
}

/** Ne pas traiter un push reçu au premier plan si l’utilisateur est déjà sur l’écran cible. */
export function shouldSuppressForegroundPush(
  pathname: string,
  payload: { route: string | null; kind: PushNotificationKind | null; conversationId: string | null },
): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (payload.kind === "like" && (path === "/likes-you" || path.startsWith("/likes-you/"))) {
    return true;
  }

  if (payload.kind === "message" && payload.conversationId) {
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

  if (payload.route) {
    const target = payload.route.startsWith("/") ? payload.route.split("?")[0]! : `/${payload.route.split("?")[0]!}`;
    if (path === target || path.startsWith(`${target}/`)) {
      return true;
    }
  }

  return false;
}
