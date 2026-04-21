/**
 * Discover MVP : pas de dépendance à des colonnes `profiles` optionnelles ou absentes en prod.
 * — Match sports + exclusion géo (rayon) si distance connue via RPC.
 */

import { getSharedSportLabelsForMatch } from "./sportMatchGroups";

export type DiscoverScoreProfileInput = {
  created_at?: string | null;
  updated_at?: string | null;
  last_active_at?: string | null;
  first_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  sport_phrase?: string | null;
  has_shared_place?: boolean | null;
  main_photo_url?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  avatar_url?: string | null;
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
  hasSharedPlace?: boolean;
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

const W_SHARED_SPORTS = 0.4;
const W_DISTANCE = 0.25;
const W_FRESHNESS = 0.15;
const W_QUALITY = 0.1;
const W_SHARED_PLACE = 0.1;

function safeTimeMs(iso: string | null | undefined): number {
  if (typeof iso !== "string" || !iso.trim()) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function normalizedFreshnessScore(profile: DiscoverScoreProfileInput): number {
  const now = Date.now();
  const activityMs =
    safeTimeMs(profile.last_active_at) || safeTimeMs(profile.updated_at) || safeTimeMs(profile.created_at);
  if (!activityMs) return 0.2;
  const days = Math.max(0, (now - activityMs) / (24 * 60 * 60 * 1000));
  if (days <= 1) return 1;
  if (days <= 3) return 0.85;
  if (days <= 7) return 0.7;
  if (days <= 14) return 0.55;
  if (days <= 30) return 0.35;
  return 0.15;
}

function normalizedQualityScore(profile: DiscoverScoreProfileInput): number {
  let score = 0;
  const hasDisplayPhoto = [profile.main_photo_url, profile.portrait_url, profile.fullbody_url, profile.avatar_url]
    .some((url) => typeof url === "string" && url.trim().length > 0);
  const photoApproved = String(profile.photo_status ?? "").trim().toLowerCase() === "approved";
  if (hasDisplayPhoto) score += 0.35;
  if (photoApproved || profile.is_photo_verified === true) score += 0.35;
  if (profile.profile_completed === true) score += 0.15;
  if (profile.first_name?.trim() && profile.gender && profile.birth_date) score += 0.1;
  if (profile.sport_phrase?.trim()) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function normalizedDistanceScore(distanceKm: number | null, radiusKm: number | null): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 0.5;
  if (radiusKm != null && radiusKm > 0) {
    return Math.max(0, Math.min(1, 1 - distanceKm / radiusKm));
  }
  if (distanceKm <= 5) return 1;
  if (distanceKm <= 15) return 0.8;
  if (distanceKm <= 30) return 0.6;
  if (distanceKm <= 50) return 0.45;
  return 0.3;
}

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

  const sharedSportsNormalized = Math.min(sharedSportsCount, 3) / 3;
  const distanceNormalized = normalizedDistanceScore(distancePart.distanceKm, radius);
  const freshnessNormalized = normalizedFreshnessScore(profile);
  const qualityNormalized = normalizedQualityScore(profile);
  const sharedPlaceNormalized = context.hasSharedPlace === true || profile.has_shared_place === true ? 1 : 0;
  const weighted =
    sharedSportsNormalized * W_SHARED_SPORTS +
    distanceNormalized * W_DISTANCE +
    freshnessNormalized * W_FRESHNESS +
    qualityNormalized * W_QUALITY +
    sharedPlaceNormalized * W_SHARED_PLACE;
  const weightedScore = Math.round(weighted * 1000);
  if (sharedSportsCount >= 2) reasons.push("Affinité sport forte");
  if (sharedPlaceNormalized > 0) reasons.push("Lieu commun");

  return {
    score: weightedScore,
    distanceKm: distancePart.distanceKm,
    sharedSportsCount,
    reasons: reasons.slice(0, 4),
    excluded: false,
  };
}

/** Réservé debug / futur — pas de signal « confiance » en MVP. */
export function computeReliabilityScore(_p: DiscoverScoreProfileInput): number {
  return normalizedQualityScore(_p);
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
  profile: DiscoverScoreProfileInput,
  commonSportsCount: number,
): DiscoverScoreBreakdown {
  const common = Math.max(0, Math.min(3, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0)));
  const commonWeighted = (common / 3) * W_SHARED_SPORTS * 1000;
  const freshnessWeighted = normalizedFreshnessScore(profile) * W_FRESHNESS * 1000;
  const qualityWeighted = normalizedQualityScore(profile) * W_QUALITY * 1000;
  return {
    total: Math.round(commonWeighted + freshnessWeighted + qualityWeighted),
    common: Math.round(commonWeighted),
    completeness: Math.round(qualityWeighted),
    lastActive: Math.round(freshnessWeighted),
    newness: Math.round(freshnessWeighted),
  };
}
