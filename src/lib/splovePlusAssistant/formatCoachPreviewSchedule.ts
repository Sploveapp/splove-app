/** Affichage humain du créneau sur la carte récap Coach (ex. « Jeudi 18h30 »). */
export function formatCoachPreviewSchedule(
  dateLocal: string,
  timeLocal: string,
  language: "fr" | "en",
): string {
  const date = formatCoachPreviewDateLabel(dateLocal, language);
  const time = formatCoachPreviewTimeLabel(timeLocal, language);
  if (!date && !time) return "";
  if (!date) return time;
  if (!time) return date;
  return `${date} ${time}`;
}

/** Date seule — ex. « Jeudi 12 juin ». */
export function formatCoachPreviewDateLabel(dateLocal: string, language: "fr" | "en"): string {
  if (!dateLocal.trim()) return "";
  const d = new Date(`${dateLocal}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (language === "fr") {
    const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
    const dayMonth = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${cap} ${dayMonth}`;
  }
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** Heure seule — ex. « 18h30 ». */
export function formatCoachPreviewTimeLabel(timeLocal: string, language: "fr" | "en"): string {
  const raw = timeLocal.trim();
  if (!raw) return "";
  const [hStr, mStr] = raw.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;
  if (language === "fr") {
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }
  const d = new Date(1970, 0, 1, h, m);
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}
