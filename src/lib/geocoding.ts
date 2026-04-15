/**
 * Géocodage léger V1 — pas d’API clé requise.
 * Reverse : OpenStreetMap Nominatim (usage raisonnable ; repli manuel si échec réseau / CORS).
 *
 * Pour une future autocomplete villes : brancher ici `searchCitiesApprox` (provider au choix).
 */

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

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

/**
 * Stub autocomplete — remplacer par un provider (Mapbox, Google Places, etc.) quand prêt.
 * @returns suggestions { label, lat, lng } pour préremplir city + coords.
 */
export async function searchCitiesApprox(_query: string): Promise<{ label: string; lat: number; lng: number }[]> {
  return [];
}
