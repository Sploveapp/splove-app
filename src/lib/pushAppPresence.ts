import { updateDevicePushPresence } from "../services/deviceTokens.service";

let lastPresenceKey = "";
let presenceTimer: ReturnType<typeof setTimeout> | null = null;

function presenceKey(
  userId: string,
  pathname: string,
  conversationId: string | null,
): string {
  return `${userId}|${pathname}|${conversationId ?? ""}`;
}

/**
 * Met à jour la présence (route active) pour éviter les push inutiles côté serveur.
 */
export function scheduleDevicePushPresenceSync(
  userId: string,
  pathname: string,
  conversationId?: string | null,
): void {
  if (!userId) return;

  const route = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const convId = conversationId ?? extractConversationIdFromPath(route);
  const key = presenceKey(userId, route, convId);

  if (key === lastPresenceKey) return;
  lastPresenceKey = key;

  if (presenceTimer) clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    void updateDevicePushPresence(userId, route, convId);
  }, 400);
}

function extractConversationIdFromPath(pathname: string): string | null {
  const chat = pathname.match(/^\/chat\/([^/]+)/);
  if (chat?.[1]) return chat[1];
  const match = pathname.match(/^\/match\/([^/]+)/);
  if (match?.[1]) return match[1];
  return null;
}

export function resetDevicePushPresenceCache(): void {
  lastPresenceKey = "";
  if (presenceTimer) {
    clearTimeout(presenceTimer);
    presenceTimer = null;
  }
}
