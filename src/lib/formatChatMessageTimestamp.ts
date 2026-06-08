/** Heure locale HH:mm (24h). */
function formatTimeLocal(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function startOfLocalDayMs(ms: number): number {
  const x = new Date(ms);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}

/**
 * Timestamp discret sous une bulle de chat.
 * Aujourd’hui : 18:42 · Hier : Hier 18:42 · plus ancien : 14 mai · 18:42
 */
export function formatChatMessageTimestamp(
  iso: string,
  locale: string,
  yesterdayLabel: string,
  nowMs: number = Date.now(),
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = formatTimeLocal(d, locale);
  const msgDay = startOfLocalDayMs(d.getTime());
  const today = startOfLocalDayMs(nowMs);
  const dayMs = 86_400_000;
  const diffDays = Math.round((today - msgDay) / dayMs);
  if (diffDays === 0) return time;
  if (diffDays === 1) return `${yesterdayLabel} ${time}`;
  const datePart = d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(/\.$/, "");
  return `${datePart} · ${time}`;
}

/** Heure seule pour « Vu à 18:42 ». */
export function formatChatReadTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatTimeLocal(d, locale);
}
