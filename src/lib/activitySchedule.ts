/** Libellé UI localisé — interdit pour `p_scheduled_at` (ex. « 17 mai 2026 à 18:00 »). */
export function isLocaleDisplayDateLabel(value: string): boolean {
  return (
    /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      value,
    ) || /\s(à|at)\s\d{1,2}:\d{2}/i.test(value)
  );
}

/**
 * Valeurs acceptées pour `activity_proposals.scheduled_at` / `p_scheduled_at` (timestamptz).
 * Les libellés UI localisés restent dans `time_slot` uniquement.
 */
export function toSupabaseScheduledAtIso(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || isLocaleDisplayDateLabel(raw)) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(" ", "T") : raw;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}
