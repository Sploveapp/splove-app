import { formatCityDisplay } from "../formatCityDisplay";

/**
 * Lieux suggérés à partir des données déjà disponibles (ville, lieu initial).
 * TODO(v2-ai): enrichir avec spots / lieux communs géolocalisés.
 */
export function suggestMeetupPlaces(input: {
  viewerCity?: string | null;
  partnerCity?: string | null;
  initialPlace?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string | null | undefined) => {
    const label = (raw ?? "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };

  push(input.initialPlace);
  push(formatCityDisplay(input.viewerCity) || input.viewerCity);
  push(formatCityDisplay(input.partnerCity) || input.partnerCity);

  return out.slice(0, 3);
}
