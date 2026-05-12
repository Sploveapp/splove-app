/**
 * Tranches horaires locales (navigateur) pour un thème « sport welcome » jour / nuit.
 * Réutilisable : même borne pour d’autres écrans publics si besoin.
 *
 * - Jour : 06h30 inclus → 18h30 exclus
 * - Nuit : 18h30 inclus → 06h30 exclus le lendemain
 */
export type LocalDayNightPhase = "day" | "night";

export function localDayNightPhaseFromDate(d: Date): LocalDayNightPhase {
  const m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const dayStart = 6 * 60 + 30;
  const dayEnd = 18 * 60 + 30;
  if (m >= dayStart && m < dayEnd) return "day";
  return "night";
}

/** Millisecondes jusqu’à la prochaine frontière 06:30 ou 18:30. */
export function msUntilNextDayNightBoundary(from: Date = new Date()): number {
  const next = new Date(from);
  const dayStart = new Date(from);
  dayStart.setHours(6, 30, 0, 0);
  const dayEnd = new Date(from);
  dayEnd.setHours(18, 30, 0, 0);
  if (from.getTime() < dayStart.getTime()) next.setTime(dayStart.getTime());
  else if (from.getTime() < dayEnd.getTime()) next.setTime(dayEnd.getTime());
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 30, 0, 0);
  }
  const delta = next.getTime() - from.getTime();
  return Math.max(5_000, delta);
}
