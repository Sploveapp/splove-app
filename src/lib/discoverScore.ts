/**
 * Discover MVP : pas de dépendance à des colonnes `profiles` optionnelles ou absentes en prod.
 * — Match sports + exclusion géo (rayon) si distance connue via RPC.
 */

import { getSharedSportLabelsForMatch } from "./sportMatchGroups";

export type DiscoverScoreProfileInput = {
  created_at?: string | null;
  profile_sports?: unknown[] | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  photo_status?: string | null;
  is_photo_verified?: boolean | null;
  profile_completed?: boolean | null;
};

function firstFiniteNumber(values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function toCoords(input: unknown): { lat: number; lng: number } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const lat = firstFiniteNumber([o.latitude, o.lat]);
  const lng = firstFiniteNumber([o.longitude, o.lng, o.lon, o.long]);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

export function getDistanceScoreFromKm(
  distanceKm: number | null,
  searchRadiusKm: number | null,
): { distanceKm: number | null; excluded: boolean; exclusionReason?: string } {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { distanceKm: null, excluded: false };
  }
  const radius = firstFiniteNumber([searchRadiusKm]);
  if (radius != null && radius > 0 && distanceKm > radius) {
    return {
      distanceKm,
      excluded: true,
      exclusionReason: "outside_search_radius",
    };
  }
  return { distanceKm, excluded: false };
}

export function getDistanceScore(input: {
  viewer: unknown;
  candidate: unknown;
  searchRadiusKm?: number | null;
}): { distanceKm: number | null; excluded: boolean; exclusionReason?: string } {
  const viewer = toCoords(input.viewer);
  const candidate = toCoords(input.candidate);
  if (!viewer || !candidate) return { distanceKm: null, excluded: false };
  const distanceKm = haversineKm(viewer, candidate);
  return getDistanceScoreFromKm(distanceKm, input.searchRadiusKm ?? null);
}

export type DiscoverScoreContext = {
  mySportMatchKeys: Set<string>;
  myProfile?: {
    latitude?: number | null;
    longitude?: number | null;
    lat?: number | null;
    lng?: number | null;
    discovery_radius_km?: number | null;
    max_distance_km?: number | null;
    search_radius_km?: number | null;
  } | null;
  distanceKmOverride?: number | null;
};

export type DiscoverScoreResult = {
  score: number;
  distanceKm: number | null;
  sharedSportsCount: number;
  reasons: string[];
  excluded: boolean;
  exclusionReason?: string;
};

export function getSharedSportsCount(
  mySportMatchKeys: Set<string>,
  profile: DiscoverScoreProfileInput,
): number {
  if (!(mySportMatchKeys instanceof Set) || mySportMatchKeys.size === 0) return 0;
  return getSharedSportLabelsForMatch(
    mySportMatchKeys,
    profile as { profile_sports?: { sports?: { slug?: string | null; label?: string | null } | null }[] | null },
  ).length;
}

const MVP_DISCOVER_SCORE = 1;

export function buildDiscoverScore(
  profile: DiscoverScoreProfileInput,
  context: DiscoverScoreContext,
): DiscoverScoreResult {
  const sharedSportsCount = getSharedSportsCount(context.mySportMatchKeys, profile);
  if (sharedSportsCount <= 0) {
    return {
      score: 0,
      distanceKm: null,
      sharedSportsCount,
      reasons: [],
      excluded: true,
      exclusionReason: "no_shared_sports",
    };
  }

  const radius = firstFiniteNumber([
    context.myProfile?.discovery_radius_km,
    context.myProfile?.search_radius_km,
    context.myProfile?.max_distance_km,
  ]);

  const distancePart =
    context.distanceKmOverride !== undefined
      ? getDistanceScoreFromKm(context.distanceKmOverride, radius)
      : getDistanceScore({
          viewer: context.myProfile ?? null,
          candidate: profile,
          searchRadiusKm: radius,
        });

  if (distancePart.excluded) {
    return {
      score: 0,
      distanceKm: distancePart.distanceKm,
      sharedSportsCount,
      reasons: [],
      excluded: true,
      exclusionReason: distancePart.exclusionReason,
    };
  }

  const reasons: string[] = [];
  reasons.push(
    sharedSportsCount >= 2
      ? `${sharedSportsCount} sports en commun`
      : "1 sport en commun",
  );
  if (distancePart.distanceKm != null) {
    reasons.push(`À ${Math.round(distancePart.distanceKm)} km`);
  }

  return {
    score: MVP_DISCOVER_SCORE,
    distanceKm: distancePart.distanceKm,
    sharedSportsCount,
    reasons: reasons.slice(0, 4),
    excluded: false,
  };
}

/** Réservé debug / futur — pas de signal « confiance » en MVP. */
export function computeReliabilityScore(_p: DiscoverScoreProfileInput): number {
  void _p;
  return 0;
}

export function getReliabilityUiHints(_p: unknown): string[] {
  void _p;
  /** Éviter le doublon avec le badge « Profil vérifié » sur la carte — copy confiance réservée aux tooltips / fiche profil. */
  return [];
}

export type DiscoverScoreBreakdown = {
  total: number;
  common: number;
  completeness: number;
  lastActive: number;
  newness: number;
};

export function computeDiscoverMatchScoreBreakdown(
  _profile: DiscoverScoreProfileInput,
  commonSportsCount: number,
): DiscoverScoreBreakdown {
  const common = Math.max(0, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0));
  return {
    total: MVP_DISCOVER_SCORE,
    common: common * 10,
    completeness: 0,
    lastActive: 0,
    newness: 0,
  };
}
