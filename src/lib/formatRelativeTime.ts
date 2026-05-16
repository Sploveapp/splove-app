/** Timestamp relatif court (ex. « il y a 5 min »). */
export function formatRelativeTime(
  iso: string,
  locale: string,
  nowMs: number = Date.now(),
): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const deltaSec = Math.round((t - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (abs < 60) return rtf.format(deltaSec, "second");
  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return rtf.format(deltaMin, "minute");
  const deltaHour = Math.round(deltaMin / 60);
  if (Math.abs(deltaHour) < 24) return rtf.format(deltaHour, "hour");
  const deltaDay = Math.round(deltaHour / 24);
  if (Math.abs(deltaDay) < 7) return rtf.format(deltaDay, "day");
  const deltaWeek = Math.round(deltaDay / 7);
  if (Math.abs(deltaWeek) < 5) return rtf.format(deltaWeek, "week");
  const deltaMonth = Math.round(deltaDay / 30);
  if (Math.abs(deltaMonth) < 12) return rtf.format(deltaMonth, "month");
  return rtf.format(Math.round(deltaDay / 365), "year");
}
