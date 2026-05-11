/**
 * Géocodage léger V1 — pas d’API clé requise.
 * Reverse : OpenStreetMap Nominatim (usage raisonnable ; repli manuel si échec réseau / CORS).
 */

import { formatCityDisplay, normalizePrimaryLocalityLabel } from "./formatCityDisplay";

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

/** Identifiant requis par la politique d’usage Nominatim. */
const NOMINATIM_USER_AGENT = "SPLove/1.0 (profile-location)";

/** Extrait la localité principale depuis `address` Nominatim (sans `county`). */
function pickCityFromNominatimAddress(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  const pick = (k: string) => {
    const v = addr[k];
    if (typeof v !== "string") return null;
    const n = normalizePrimaryLocalityLabel(v);
    return n.length > 0 ? n : null;
  };
  return (
    pick("city") ||
    pick("town") ||
    pick("village") ||
    pick("municipality") ||
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
    const url = `${NOMINATIM_REVERSE}?format=json&addressdetails=1&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=fr`;
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

export type CitySearchSuggestion = {
  /** Libellé Nominatim complet — coordonnées et logique métier uniquement ; pas pour l’UI liste. */
  label: string;
  lat: number;
  lng: number;
  /** Pays lisible pour dédoublonner même nom de commune (UX). */
  country: string | null;
  /** Localité OSM (`address`) — à persister dans `profiles.city`. */
  locality: string | null;
};

function nominatimRowToSuggestion(row: Record<string, unknown>): CitySearchSuggestion | null {
  const latRaw = row.lat;
  const lonRaw = row.lon;
  const lat = typeof latRaw === "string" ? Number(latRaw) : typeof latRaw === "number" ? latRaw : NaN;
  const lng = typeof lonRaw === "string" ? Number(lonRaw) : typeof lonRaw === "number" ? lonRaw : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const addr = (row.address as Record<string, unknown>) ?? null;
  const country =
    addr && typeof addr.country === "string" && addr.country.trim() ? addr.country.trim() : null;
  const locality = pickCityFromNominatimAddress(addr);
  const display =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : locality ?? "";
  const label = display || `${lat},${lng}`;
  return { label, lat, lng, country, locality };
}

/**
 * Libellé liste onboarding : commune courte ; « Ville, Pays » si plusieurs hits partagent la même commune affichée.
 */
export function formatCitySuggestionListLabel(
  rows: readonly CitySearchSuggestion[],
  index: number,
): string {
  const sug = rows[index];
  if (!sug) return "";
  const lblRaw = sug.label.trim();
  const primary = formatCityDisplay(lblRaw).trim();
  const base = primary || lblRaw.split(",")[0]?.trim() || lblRaw;
  const key = base.trim().toLowerCase();
  if (!key) return sug.label.trim();
  const collisions = rows.filter((r) => formatCityDisplay(r.label).trim().toLowerCase() === key);
  if (collisions.length <= 1) return base.trim();
  const ctry = sug.country?.trim();
  if (ctry) return `${base.trim()}, ${ctry}`;
  return base.trim();
}

/**
 * Autocomplete villes — Nominatim search (limité ; usage raisonnable).
 * @returns suggestions { label, lat, lng } pour préremplir city + coords.
 */
export async function searchCitiesApprox(query: string): Promise<CitySearchSuggestion[]> {
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
    const out: CitySearchSuggestion[] = [];
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

/** Premier résultat de recherche — appel tiers uniquement si le flux métier autorise encore l’approximation. */
export async function forwardGeocodeFirst(
  query: string,
): Promise<CitySearchSuggestion | null> {
  const list = await searchCitiesApprox(query);
  return list[0] ?? null;
}
