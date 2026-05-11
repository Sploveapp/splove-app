/**
 * Séparateurs fréquents dans les libellés Nominatim / OSM (virgule, point-virgule,
 * virgule idéographique, barre, milieu / puce).
 */
const PRIMARY_LOCALITY_SPLIT =
  /[,;，、]|\s*\/\s*|\s*\|\s*|\s*[\u00B7\u2022]\s*|\s+-\s+/;

/**
 * Extrait la localité principale (premier segment), pour stockage `profiles.city` et UI.
 */
export function normalizePrimaryLocalityLabel(raw: string | null | undefined): string {
  const collapsed = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!collapsed) return "";
  const head = collapsed.split(PRIMARY_LOCALITY_SPLIT)[0]?.trim() ?? "";
  return head;
}

/** Libellé ville court pour l’UI — alias de {@link normalizePrimaryLocalityLabel}. */
export function formatCityDisplay(city: string | null | undefined): string {
  return normalizePrimaryLocalityLabel(city);
}

/** Valeur SQL-friendly : `null` si vide après normalisation. */
export function normalizeProfileCityForStorage(raw: string | null | undefined): string | null {
  const s = normalizePrimaryLocalityLabel(raw);
  return s.length > 0 ? s : null;
}
