/** Badge compteur dans la navbar / en-tête (plafonné à 9+). */
export function formatBadge(count: number): string {
  if (!Number.isFinite(count) || count < 1) return "0";
  if (count > 9) return "9+";
  return String(Math.floor(count));
}
