export type ChatPresenceStatusKind = "online" | "minutes" | "today" | "recent" | null;

/**
 * Statut de présence dérivé uniquement de `last_active_at` (pas de faux système).
 * Sans timestamp fiable → null (rien affiché).
 */
export function resolveChatPresenceStatus(
  lastActiveAt: string | null | undefined,
  nowMs: number = Date.now(),
): { kind: ChatPresenceStatusKind; minutesAgo?: number; timeLabel?: string } {
  if (!lastActiveAt?.trim()) return { kind: null };
  const t = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(t) || t > nowMs + 60_000) return { kind: null };

  const ageMs = nowMs - t;
  // Présence récente (~20 min) — même seuil que Discover, mais avec `nowMs` injectable (tests).
  if (ageMs <= 20 * 60_000) {
    return { kind: "online" };
  }

  const minutesAgo = Math.max(1, Math.floor(ageMs / 60_000));
  // Moins de 3 h → « Vu il y a X min »
  if (minutesAgo < 180) {
    return { kind: "minutes", minutesAgo };
  }

  const activeDay = new Date(t);
  const now = new Date(nowMs);
  const sameDay =
    activeDay.getFullYear() === now.getFullYear() &&
    activeDay.getMonth() === now.getMonth() &&
    activeDay.getDate() === now.getDate();

  if (sameDay) {
    const hh = String(activeDay.getHours()).padStart(2, "0");
    const mm = String(activeDay.getMinutes()).padStart(2, "0");
    return { kind: "today", timeLabel: `${hh}:${mm}` };
  }

  // Activité connue mais plus ancienne — formulation neutre.
  return { kind: "recent" };
}

export function formatChatPresenceLabel(
  lastActiveAt: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
  nowMs: number = Date.now(),
): string | null {
  const status = resolveChatPresenceStatus(lastActiveAt, nowMs);
  if (status.kind === "online") return t("chat_presence_online");
  if (status.kind === "minutes" && status.minutesAgo != null) {
    return t("chat_presence_minutes", { minutes: status.minutesAgo });
  }
  if (status.kind === "today" && status.timeLabel) {
    return t("chat_presence_today", { time: status.timeLabel });
  }
  if (status.kind === "recent") return t("chat_presence_recent");
  return null;
}

/** Cible de navigation du bouton marque (jamais history.back). */
export const CHAT_BACK_TO_MOVE_PATH = "/move" as const;

export const CHAT_HEADER_SAFE_AREA_PADDING_TOP =
  "calc(env(safe-area-inset-top, 0px) + 8px)" as const;

export const CHAT_COMPOSER_SAFE_AREA_PADDING_BOTTOM =
  "calc(12px + env(safe-area-inset-bottom, 0px))" as const;

/** Padding bas du composer — clavier ouvert : nav masquée, composer collé au clavier (12px). */
export function resolveChatComposerPaddingBottom(keyboardInsetPx: number): string {
  if (keyboardInsetPx >= 50) {
    return "12px";
  }
  return CHAT_COMPOSER_SAFE_AREA_PADDING_BOTTOM;
}
