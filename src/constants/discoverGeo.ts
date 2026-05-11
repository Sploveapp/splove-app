/**
 * Rayon Discover SPLove — valeurs fixes produit (km).
 *
 * SPLove+ — mode voyage / zone future : le centre de recherche pourra être
 * `profiles.passport_city` (+ lat/lng associées en migration dédiée) ou des
 * colonnes `discovery_center_*`, tout en réutilisant ces rayons avec
 * `profile_distances_from_viewer`-style RPC paramétré par ce centre au lieu du
 * domicile `profiles.latitude/longitude`.
 */
export const DISCOVERY_RADIUS_KM_ALLOWED = [10, 25, 50, 100] as const;

export type DiscoveryRadiusKm = (typeof DISCOVERY_RADIUS_KM_ALLOWED)[number];

export function isValidDiscoveryRadiusKm(n: unknown): n is DiscoveryRadiusKm {
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  const r = Math.round(n);
  return (DISCOVERY_RADIUS_KM_ALLOWED as readonly number[]).includes(r);
}

export function normalizeDiscoveryRadiusKm(n: unknown): DiscoveryRadiusKm | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return (DISCOVERY_RADIUS_KM_ALLOWED as readonly number[]).includes(r)
    ? (r as DiscoveryRadiusKm)
    : null;
}

/** Coordonnées GPS utilisables pour Discover (nombre fini ou chaîne numérique PostgREST). */
export function hasFiniteDiscoverCoordinates(p: {
  latitude?: unknown;
  longitude?: unknown;
}): boolean {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  return toNum(p.latitude) != null && toNum(p.longitude) != null;
}

/**
 * Liste Discover : exclusion absolue des profils sans lat/lng valides (état + rendu).
 * Logs DEV : candidat exclu avec raison.
 */
export function takeDiscoverProfilesWithValidGps<
  T extends { id?: string; first_name?: string | null; latitude?: unknown; longitude?: unknown },
>(list: readonly T[]): T[] {
  const out: T[] = [];
  for (const p of list) {
    if (hasFiniteDiscoverCoordinates(p)) {
      out.push(p);
      continue;
    }
    if (import.meta.env.DEV) {
      console.warn("[Discover GPS] excluded_candidate", {
        candidate_profile_id: p.id ?? null,
        first_name: p.first_name ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        excluded_reason: "missing_or_invalid_candidate_gps",
      });
    }
  }
  return out;
}

export function viewerHasDiscoverSearchCoords(p: {
  latitude?: number | null;
  longitude?: number | null;
  discovery_radius_km?: number | null;
}): boolean {
  const lat =
    typeof p.latitude === "number" && Number.isFinite(p.latitude) ? p.latitude : null;
  const lng =
    typeof p.longitude === "number" && Number.isFinite(p.longitude) ? p.longitude : null;
  return (
    lat != null &&
    lng != null &&
    normalizeDiscoveryRadiusKm(p.discovery_radius_km ?? null) != null
  );
}
