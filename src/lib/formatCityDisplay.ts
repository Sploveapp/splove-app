/**
 * Libellé ville court pour l’UI uniquement — la valeur BDD reste inchangée.
 * Garde la partie avant la première virgule (ex. géocodage détaillé).
 */
export function formatCityDisplay(city: string | null | undefined): string {
  const raw = typeof city === "string" ? city.trim() : "";
  if (!raw) return "";
  const i = raw.indexOf(",");
  if (i <= 0) return raw;
  return raw.slice(0, i).trim();
}
