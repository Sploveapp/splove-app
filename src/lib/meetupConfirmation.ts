/**
 * Confirmation de rendez-vous post-acceptation (`activity_proposals.meetup_confirmation`).
 */

import type { MeetupEngagementV1 } from "./meetupEngagementCore";
import { parseMeetupEngagementFromUnknown } from "./meetupEngagementCore";

export type MeetupConfirmationStatus = "confirmed";

/** Objet persisté côté DB + consommé par l’UI. */
export type MeetupConfirmationPayload = {
  sport: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h) */
  time: string;
  location: string;
  status: MeetupConfirmationStatus;
  /** ISO 8601 */
  confirmed_at: string;
  confirmed_by_user_id?: string | null;
  /** Rappels anti-ghosting, annulation propre, etc. */
  engagement?: MeetupEngagementV1;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function normalizeMeetupTimeHm(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const hh = Number(parts[0]?.trim());
  const mm = Number(parts[1]?.trim());
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}

export function parseMeetupConfirmationFromRow(raw: unknown): MeetupConfirmationPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.status !== "confirmed") return null;
  const sport = typeof o.sport === "string" ? o.sport.trim() : "";
  const date = typeof o.date === "string" ? o.date.trim() : "";
  const loc = typeof o.location === "string" ? o.location.trim() : "";
  const confirmedAt = typeof o.confirmed_at === "string" ? o.confirmed_at.trim() : "";
  if (!sport || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !loc || !confirmedAt) return null;
  const timeNorm = normalizeMeetupTimeHm(typeof o.time === "string" ? o.time : null);
  if (!timeNorm) return null;

  let confirmedBy: string | null | undefined;
  const rawBy = o.confirmed_by_user_id;
  if (typeof rawBy === "string" && rawBy.trim()) confirmedBy = rawBy.trim();

  const out: MeetupConfirmationPayload = {
    sport,
    date,
    time: timeNorm,
    location: loc,
    status: "confirmed",
    confirmed_at: confirmedAt,
  };
  if (confirmedBy) out.confirmed_by_user_id = confirmedBy;

  const engParsed = parseMeetupEngagementFromUnknown(o.engagement);
  if (engParsed) out.engagement = engParsed;

  return out;
}

export function isMeetupConfirmationPayload(raw: unknown): raw is MeetupConfirmationPayload {
  return parseMeetupConfirmationFromRow(raw) != null;
}

export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toHm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** DTSTART / DTEND sans suffixe Z (heure « flottante » locale ICS). */
export function meetupCompactLocalDateTime(dateYmd: string, timeHm: string): string {
  const [y, m, d] = dateYmd.split("-").map((x) => Number(x.trim()));
  const parts = timeHm.trim().split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] ?? 0);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    return "";
  }
  return `${pad2(y)}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

/** +1 h pour DTEND MVP (retour même format compact). */
export function meetupDtEndPlusOneHour(dateYmd: string, timeHm: string): string {
  const [y, m, d] = dateYmd.split("-").map((x) => Number(x.trim()));
  const parts = timeHm.trim().split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] ?? 0);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    return "";
  }
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setHours(dt.getHours() + 1);
  return meetupCompactLocalDateTime(toYmd(dt), toHm(dt));
}

function icsEscapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function buildMeetupIcsCalendar(input: {
  uid: string;
  sport: string;
  dateYmd: string;
  timeHm: string;
  location: string;
  /** libellé humain lieu + sport */
  summary: string;
}): string {
  const dtstart = meetupCompactLocalDateTime(input.dateYmd, input.timeHm);
  const dtend = meetupDtEndPlusOneHour(input.dateYmd, input.timeHm);
  if (!dtstart || !dtend) return "";
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const desc = icsEscapeText(`${input.sport} — SPLove`);
  const loc = icsEscapeText(input.location.trim());
  const sum = icsEscapeText(input.summary.trim());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//SPLove//Meetup//FR",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${sum}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${loc}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

/** Tente ISO 8601 sur time_slot ou morceaux du message métier. */
export function tryParseDateTimeFromProposalTimeSlot(raw: string | null | undefined): Date | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const iso = /\d{4}-\d{2}-\d{2}T/.test(s) ? s : null;
  if (iso) {
    const d = new Date(iso.replace(/(\+\d{2})(\d{2})$/, "$1:$2"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
  return null;
}

const MEETUP_MESSAGE_MARKER = "[splove-meetup-confirmed]" as const;

/** Fallback si colonne DB absente — message texte dans le fil. */
export function tryParseMeetupFromMessageBody(body: string): MeetupConfirmationPayload | null {
  const t = body.trimStart();
  if (!t.startsWith(MEETUP_MESSAGE_MARKER)) return null;
  const jsonPart = t.slice(MEETUP_MESSAGE_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as unknown;
    return parseMeetupConfirmationFromRow(parsed);
  } catch {
    return null;
  }
}

export function buildMeetupConfirmedMessageBody(payload: MeetupConfirmationPayload): string {
  return `${MEETUP_MESSAGE_MARKER}\n${JSON.stringify(payload)}`;
}
