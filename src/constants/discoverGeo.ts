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
  latitude?: number | string | null;
  longitude?: number | string | null;
}): boolean {
  const toNum = (v: unknown): number | null => {
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
