/**
 * Parse un timestamptz Supabase / ISO 8601 en epoch ms.
 * - Ajoute Z si la chaîne est sans fuseau (interprétation UTC).
 * - Retourne NaN si invalide ou absent.
 */
export function parseSupabaseTimestamp(iso: string | null | undefined): number {
  if (iso == null || typeof iso !== "string") return NaN;
  const trimmed = iso.trim();
  if (!trimmed) return NaN;

  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed) && !/[zZ]$/.test(trimmed) && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    normalized = trimmed.replace(" ", "T") + (trimmed.includes("T") || trimmed.includes(" ") ? "Z" : "");
  }

  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}
