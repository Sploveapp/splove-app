import { computeProfileCompleted } from "./profileCompleteness";
import { isPhotoVerified } from "./profileVerification";
import { getSharedSportLabelsForMatch } from "./sportMatchGroups";

/**
 * Discover : qualité de match + fiabilité (anti-fantôme), sans affichage du score brut.
 *
 * - `computeDiscoverMatchScore` : affinité / profil (sans propositions — voir fiabilité)
 * - `computeReliabilityScore` : réponses, messages, propositions, pénalité inactivité
 */

export type DiscoverScoreProfileInput = {
  created_at?: string | null;
  last_active_at?: string | null;
  /** Dernier message envoyé (migration 046). */
  last_reply_at?: string | null;
  messages_count?: number | null;
  first_name?: string | null;
  birth_date?: string | null;
  profile_completed?: boolean | null;
  sport_feeling?: string | null;
  sport_phrase?: string | null;
  main_photo_url?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  fullbody_url?: string | null;
  is_photo_verified?: boolean | null;
  activity_proposals_count?: number | null;
  /** Boost après double retour positif (migration 047) — jamais affiché brut. */
  boost_score?: number | null;
  profile_sports?: unknown[] | null;
};

/** Entiers ≥ 0 pour compteurs API (évite NaN / chaînes / null). */
export function coerceNonNegativeInt(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
}

/** ISO tolérant : null si vide ou date invalide. */
export function sanitizeIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? t : null;
}

/** Copie défensive pour scoring / tri (ne mute pas l’objet source). */
export function normalizeDiscoverProfileInput(p: DiscoverScoreProfileInput): DiscoverScoreProfileInput {
  return {
    ...p,
    messages_count: coerceNonNegativeInt(p.messages_count),
    activity_proposals_count: coerceNonNegativeInt(p.activity_proposals_count),
    boost_score: coerceNonNegativeInt(p.boost_score),
    last_reply_at: sanitizeIsoDate(p.last_reply_at),
    last_active_at: sanitizeIsoDate(p.last_active_at),
    created_at: sanitizeIsoDate(p.created_at),
  };
}

function hasDisplayPhoto(p: DiscoverScoreProfileInput): boolean {
  for (const u of [p.main_photo_url, p.portrait_url, p.avatar_url, p.fullbody_url]) {
    if (typeof u === "string" && u.trim().length > 0) return true;
  }
  return false;
}

/** 0–35 points — profil prêt à passer au réel. */
export function profileCompletenessPoints(p: DiscoverScoreProfileInput): number {
  let pts = 0;
  if (hasDisplayPhoto(p)) pts += 10;
  if (p.first_name?.trim()) pts += 4;
  if (p.birth_date) pts += 4;
  if (p.profile_completed) pts += 5;
  const nSports = Array.isArray(p.profile_sports) ? p.profile_sports.length : 0;
  if (nSports >= 1) pts += 4;
  if (nSports >= 2) pts += 2;
  if (p.sport_phrase?.trim() || p.sport_feeling?.trim()) pts += 4;
  if (p.is_photo_verified) pts += 2;
  return Math.min(35, pts);
}

/** 0–30 — activité app récente. */
export function lastActivePoints(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (ageMs <= 3 * hour) return 30;
  if (ageMs <= 24 * hour) return 24;
  if (ageMs <= 3 * day) return 18;
  if (ageMs <= 7 * day) return 10;
  if (ageMs <= 30 * day) return 4;
  return 0;
}

/** 0–10 — comptes très récents légèrement favorisés. */
export function accountNewnessPoints(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= day) return 10;
  if (ageMs <= 3 * day) return 6;
  if (ageMs <= 7 * day) return 3;
  return 0;
}

/** 0–40 — dernier message récent (signal réponse). */
export function lastReplyRecencyPoints(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageMs = Date.now() - ts;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (ageMs <= 6 * hour) return 40;
  if (ageMs <= 24 * hour) return 34;
  if (ageMs <= 3 * day) return 26;
  if (ageMs <= 7 * day) return 18;
  if (ageMs <= 14 * day) return 10;
  if (ageMs <= 30 * day) return 4;
  return 0;
}

/** 0–22 — volume de messages (engagement). */
export function messagesVolumePoints(count: number | null | undefined): number {
  const c = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.min(22, Math.floor(c * 1.45));
}

/** 0–30 — propositions d’activité (passage au réel). */
export function activityProposalsReliabilityPoints(count: number | null | undefined): number {
  const c = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.min(30, c * 6);
}

/** Pénalité si jamais écrit en chat, ou dernière activité message trop ancienne. */
export function ghostingPenaltyPoints(lastReplyAt: string | null | undefined): number {
  if (!lastReplyAt?.trim()) return -8;
  const ts = new Date(lastReplyAt).getTime();
  if (Number.isNaN(ts)) return -8;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= 7 * day) return 0;
  if (ageMs <= 21 * day) return -10;
  if (ageMs <= 45 * day) return -18;
  return -28;
}

/**
 * Score de fiabilité (tri Discover en priorité). Plus haut = mieux.
 * Ne pas afficher tel quel dans l’UI.
 */
/** 0–35 — léger avantage Discover (tri partiel), sans montrer le nombre. */
export function boostScorePoints(boost: number | null | undefined): number {
  const b = typeof boost === "number" && Number.isFinite(boost) ? Math.max(0, boost) : 0;
  return Math.min(35, b * 5);
}

export function computeReliabilityScore(p: DiscoverScoreProfileInput): number {
  try {
    const n = normalizeDiscoverProfileInput(p);
    const reply = lastReplyRecencyPoints(n.last_reply_at);
    const msgs = messagesVolumePoints(n.messages_count);
    const proposals = activityProposalsReliabilityPoints(n.activity_proposals_count);
    const penalty = ghostingPenaltyPoints(n.last_reply_at);
    const boost = boostScorePoints(n.boost_score);
    const sum = reply + msgs + proposals + penalty + boost;
    return Number.isFinite(sum) ? sum : 0;
  } catch (e) {
    console.error("[discoverScore] computeReliabilityScore failed", e);
    return 0;
  }
}

export type ReliabilityUiInput = Pick<
  DiscoverScoreProfileInput,
  "last_reply_at" | "messages_count" | "activity_proposals_count"
>;

/** Indices discrets (optionnel), max 2 — pas de score affiché. */
export function getReliabilityUiHints(p: ReliabilityUiInput): string[] {
  try {
    const x = normalizeDiscoverProfileInput(p);
    const hints: string[] = [];
    const proposals = coerceNonNegativeInt(x.activity_proposals_count);
    const lastReply = x.last_reply_at;
    const msgCount = coerceNonNegativeInt(x.messages_count);

    if (proposals >= 1) {
      hints.push("Aime passer au réel");
    }

    if (lastReply) {
      const ageMs = Date.now() - new Date(lastReply).getTime();
      if (Number.isFinite(ageMs)) {
        const day = 24 * 60 * 60 * 1000;
        const rapid =
          (ageMs <= 3 * day && msgCount >= 1) || (msgCount >= 3 && ageMs <= 14 * day);
        if (rapid) {
          hints.push("Répond généralement rapidement");
        }
      }
    }

    return hints.slice(0, 2);
  } catch (e) {
    console.error("[discoverScore] getReliabilityUiHints failed", e);
    return [];
  }
}

/**
 * Score global d’affinité (second critère de tri après fiabilité).
 */
export function computeDiscoverMatchScore(
  profile: DiscoverScoreProfileInput,
  commonSportsCount: number
): number {
  try {
    const n = normalizeDiscoverProfileInput(profile);
    const common = Math.max(0, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0)) * 100;
    const complete = profileCompletenessPoints(n);
    const active = lastActivePoints(n.last_active_at ?? n.created_at);
    const fresh = accountNewnessPoints(n.created_at);
    const sum = common + complete + active + fresh;
    return Number.isFinite(sum) ? sum : 0;
  } catch (e) {
    console.error("[discoverScore] computeDiscoverMatchScore failed", e);
    return 0;
  }
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
  commonSportsCount: number
): DiscoverScoreBreakdown {
  try {
    const n = normalizeDiscoverProfileInput(profile);
    const cc = Math.max(0, Math.floor(Number.isFinite(commonSportsCount) ? commonSportsCount : 0));
    const common = cc * 100;
    const completeness = profileCompletenessPoints(n);
    const lastActive = lastActivePoints(n.last_active_at ?? n.created_at);
    const newness = accountNewnessPoints(n.created_at);
    const total = common + completeness + lastActive + newness;
    const safe = Number.isFinite(total) ? total : 0;
    return {
      total: safe,
      common,
      completeness,
      lastActive,
      newness,
    };
  } catch (e) {
    console.error("[discoverScore] computeDiscoverMatchScoreBreakdown failed", e);
    return { total: 0, common: 0, completeness: 0, lastActive: 0, newness: 0 };
  }
}

export type DiscoverScoreContext = {
  mySportMatchKeys: Set<string>;
  myProfile?: {
    latitude?: number | null;
    longitude?: number | null;
    lat?: number | null;
    lng?: number | null;
    /** Rayon max Discover (km) — aligné migration `055_profiles_discovery_geolocation`. */
    discovery_radius_km?: number | null;
    max_distance_km?: number | null;
    search_radius_km?: number | null;
  } | null;
  /**
   * Distance viewer → candidat déjà calculée côté SQL (`profile_distances_from_viewer`).
   * `undefined` = calcul client (legacy) ; `null` = pas de distance fiable (pas d’exclusion géo).
   */
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

export const DISCOVER_SCORE_WEIGHTS = {
  sports: { one: 18, two: 27, threeOrMore: 35 },
  proximity: {
    lte3km: 30,
    lte10km: 24,
    lte20km: 18,
    lte35km: 10,
    lte50km: 4,
  },
  recency: { lt1d: 20, lt3d: 16, lt7d: 10, lt14d: 5, older: 1 },
  qualityMax: 10,
  verification: 5,
} as const;

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

function bestActivityIso(profile: DiscoverScoreProfileInput): string | null {
  return (
    sanitizeIsoDate(profile.last_active_at) ??
    sanitizeIsoDate(profile.last_reply_at) ??
    sanitizeIsoDate(profile.created_at)
  );
}

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

export function getDistanceScore(input: {
  viewer: unknown;
  candidate: unknown;
  searchRadiusKm?: number | null;
}): { score: number; distanceKm: number | null; excluded: boolean; exclusionReason?: string } {
  const viewer = toCoords(input.viewer);
  const candidate = toCoords(input.candidate);
  if (!viewer || !candidate) return { score: 0, distanceKm: null, excluded: false };
  const distanceKm = haversineKm(viewer, candidate);
  const radius = firstFiniteNumber([input.searchRadiusKm]);
  if (radius != null && radius > 0 && distanceKm > radius) {
    return {
      score: 0,
      distanceKm,
      excluded: true,
      exclusionReason: "outside_search_radius",
    };
  }
  if (distanceKm <= 3) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte3km, distanceKm, excluded: false };
  if (distanceKm <= 10) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte10km, distanceKm, excluded: false };
  if (distanceKm <= 20) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte20km, distanceKm, excluded: false };
  if (distanceKm <= 35) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte35km, distanceKm, excluded: false };
  if (distanceKm <= 50) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte50km, distanceKm, excluded: false };
  return { score: 0, distanceKm, excluded: false };
}

/** Même logique que `getDistanceScore` une fois la distance (km) connue, sans lat/lng du candidat côté client. */
export function getDistanceScoreFromKm(
  distanceKm: number | null,
  searchRadiusKm: number | null,
): { score: number; distanceKm: number | null; excluded: boolean; exclusionReason?: string } {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { score: 0, distanceKm: null, excluded: false };
  }
  const radius = firstFiniteNumber([searchRadiusKm]);
  if (radius != null && radius > 0 && distanceKm > radius) {
    return {
      score: 0,
      distanceKm,
      excluded: true,
      exclusionReason: "outside_search_radius",
    };
  }
  if (distanceKm <= 3) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte3km, distanceKm, excluded: false };
  if (distanceKm <= 10) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte10km, distanceKm, excluded: false };
  if (distanceKm <= 20) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte20km, distanceKm, excluded: false };
  if (distanceKm <= 35) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte35km, distanceKm, excluded: false };
  if (distanceKm <= 50) return { score: DISCOVER_SCORE_WEIGHTS.proximity.lte50km, distanceKm, excluded: false };
  return { score: 0, distanceKm, excluded: false };
}

export function getRecencyScore(profile: DiscoverScoreProfileInput): number {
  const iso = bestActivityIso(profile);
  if (!iso) return 0;
  const ageMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < day) return DISCOVER_SCORE_WEIGHTS.recency.lt1d;
  if (ageMs < 3 * day) return DISCOVER_SCORE_WEIGHTS.recency.lt3d;
  if (ageMs < 7 * day) return DISCOVER_SCORE_WEIGHTS.recency.lt7d;
  if (ageMs < 14 * day) return DISCOVER_SCORE_WEIGHTS.recency.lt14d;
  return DISCOVER_SCORE_WEIGHTS.recency.older;
}

export function getProfileQualityScore(profile: DiscoverScoreProfileInput): number {
  let pts = 0;
  if (typeof profile.portrait_url === "string" && profile.portrait_url.trim()) pts += 3;
  if (typeof profile.fullbody_url === "string" && profile.fullbody_url.trim()) pts += 3;
  if (typeof profile.sport_phrase === "string" && profile.sport_phrase.trim()) pts += 1;
  if (typeof profile.sport_feeling === "string" && profile.sport_feeling.trim()) pts += 1;
  const nSports = Array.isArray(profile.profile_sports) ? profile.profile_sports.length : 0;
  if (nSports >= 2) pts += 1;
  if (
    profile.profile_completed === true ||
    computeProfileCompleted({
      first_name: profile.first_name ?? null,
      birth_date: profile.birth_date ?? null,
      portrait_url: profile.portrait_url ?? null,
      fullbody_url: profile.fullbody_url ?? null,
    })
  ) {
    pts += 2;
  }
  return Math.min(DISCOVER_SCORE_WEIGHTS.qualityMax, pts);
}

export function getVerificationScore(profile: {
  is_photo_verified?: boolean | null;
  photo_verification_status?: string | null;
  photo_status?: string | null;
}): number {
  if (isPhotoVerified(profile)) return DISCOVER_SCORE_WEIGHTS.verification;
  const status = `${profile.photo_verification_status ?? profile.photo_status ?? ""}`
    .toLowerCase()
    .trim();
  return status === "verified" ? DISCOVER_SCORE_WEIGHTS.verification : 0;
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

  const sportsScore =
    sharedSportsCount >= 3
      ? DISCOVER_SCORE_WEIGHTS.sports.threeOrMore
      : sharedSportsCount === 2
        ? DISCOVER_SCORE_WEIGHTS.sports.two
        : DISCOVER_SCORE_WEIGHTS.sports.one;
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

  const recencyScore = getRecencyScore(profile);
  const qualityScore = getProfileQualityScore(profile);
  const verificationScore = getVerificationScore(profile);
  const score = sportsScore + distancePart.score + recencyScore + qualityScore + verificationScore;

  const reasons: string[] = [];
  reasons.push(
    sharedSportsCount >= 3
      ? "3+ sports en commun"
      : `${sharedSportsCount} sport${sharedSportsCount > 1 ? "s" : ""} en commun`,
  );
  if (distancePart.distanceKm != null) {
    reasons.push(`À ${Math.round(distancePart.distanceKm)} km`);
  }
  if (recencyScore >= 10) reasons.push("Actif récemment");
  if (qualityScore >= 7) reasons.push("Profil complet");
  if (verificationScore > 0) reasons.push("Profil vérifié");

  return {
    score,
    distanceKm: distancePart.distanceKm,
    sharedSportsCount,
    reasons: reasons.slice(0, 4),
    excluded: false,
  };
}
