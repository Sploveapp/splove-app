/**
 * Géocodage léger V1 — pas d’API clé requise.
 * Reverse : OpenStreetMap Nominatim (usage raisonnable ; repli manuel si échec réseau / CORS).
 */

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

/** Identifiant requis par la politique d’usage Nominatim. */
const NOMINATIM_USER_AGENT = "SPLove/1.0 (profile-location)";

/** Extrait un libellé ville lisible depuis la réponse Nominatim. */
function pickCityFromNominatimAddress(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  const pick = (k: string) => {
    const v = addr[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return (
    pick("city") ||
    pick("town") ||
    pick("village") ||
    pick("municipality") ||
    pick("county") ||
    null
  );
}

/**
 * Reverse geocode → nom de ville affichable (FR).
 * Retourne null si indisponible (timeout, blocage, etc.).
 */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `${NOMINATIM_REVERSE}?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=fr`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, unknown> };
    const city = pickCityFromNominatimAddress(data.address ?? null);
    return city;
  } catch {
    return null;
  }
}

function nominatimRowToSuggestion(row: Record<string, unknown>): { label: string; lat: number; lng: number } | null {
  const latRaw = row.lat;
  const lonRaw = row.lon;
  const lat = typeof latRaw === "string" ? Number(latRaw) : typeof latRaw === "number" ? latRaw : NaN;
  const lng = typeof lonRaw === "string" ? Number(lonRaw) : typeof lonRaw === "number" ? lonRaw : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const display =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : pickCityFromNominatimAddress((row.address as Record<string, unknown>) ?? null) ?? "";
  const label = display || `${lat},${lng}`;
  return { label, lat, lng };
}

/**
 * Autocomplete villes — Nominatim search (limité ; usage raisonnable).
 * @returns suggestions { label, lat, lng } pour préremplir city + coords.
 */
export async function searchCitiesApprox(query: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `${NOMINATIM_SEARCH}?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const out: { label: string; lat: number; lng: number }[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const m = nominatimRowToSuggestion(row as Record<string, unknown>);
      if (m) out.push(m);
    }
    return out;
  } catch {
    return [];
  }
}

/** Premier résultat de recherche — utilisé si l’utilisateur valide une ville saisie sans suggestion. */
export async function forwardGeocodeFirst(
  query: string,
): Promise<{ label: string; lat: number; lng: number } | null> {
  const list = await searchCitiesApprox(query);
  return list[0] ?? null;
}
