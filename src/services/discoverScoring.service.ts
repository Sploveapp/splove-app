import { practiceCompatibilityScore } from "../lib/sportPracticeCompatibilityScore";
import { getSharedSportLabelsForMatch } from "../lib/sportMatchGroups";
import { evaluateDiscoverV3, viewerOpenAdaptedResolved } from "../lib/discoverScoreV3";
import { BETA_MODE } from "../constants/beta";

type DiscoverProfile = {
  id: string;
  first_name?: string | null;
  city?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
  sport_time?: string | null;
  main_photo_url?: string | null;
  portrait_url?: string | null;
  fullbody_url?: string | null;
  avatar_url?: string | null;
  sport_phrase?: string | null;
  profile_completed?: boolean | null;
  is_banned?: boolean | null;
  banned_until?: string | null;
  status?: string | null;
  photo_status?: string | null;
  needs_adapted_activities?: boolean | null;
  is_photo_verified?: boolean | null;
  [key: string]: unknown;
};

type ViewerProfile = {
  id?: string | null;
  city?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
  sport_practice_type?: string | null;
  sport_time?: string | null;
  open_to_adapted_activities?: string | null;
  pref_open_to_adapted_activity?: boolean | null;
  discovery_radius_km?: number | null;
};

export type DiscoverScoringContext = {
  viewerId: string;
  viewer: ViewerProfile;
  likedIds: Set<string>;
  matchedIds: Set<string>;
  blockedIds?: Set<string>;
  mySportMatchKeys: Set<string>;
  distanceById: Map<string, number | null>;
  /** SPLove+ visibility / meeting priority from `discover_candidate_splove_ranking_flags` RPC */
  sploveFlagsById?: Map<string, { boost: boolean; priority_meet: boolean }>;
};

export type DiscoverScoredCandidate<T extends DiscoverProfile> = T & {
  commonSportsCount: number;
  discoverScore: number;
  practice_score: number;
  distanceKm: number | null;
  discover_reasons: string[];
  discover_excluded: boolean;
};

function safeTimeMs(iso: string | null | undefined): number {
  if (typeof iso !== "string" || !iso.trim()) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function normalizeToken(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_, -]+/g, "");
}

function isSameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = normalizeToken(a);
  const cb = normalizeToken(b);
  return Boolean(ca && cb && ca === cb);
}

function canonicalGender(raw: string | null | undefined): string | null {
  const t = normalizeToken(raw);
  if (!t) return null;
  if (["femme", "femmes", "female", "woman", "women"].includes(t)) return "female";
  if (["homme", "hommes", "male", "man", "men"].includes(t)) return "male";
  if (["femme trans", "trans_female", "trans woman", "trans women", "trans_women"].includes(t))
    return "trans_female";
  if (["homme trans", "trans_male", "trans man", "trans men", "trans_men"].includes(t))
    return "trans_male";
  if (["non-binaire", "non binaire", "non_binary", "nonbinary", "non-binary"].includes(t))
    return "non_binary";
  return null;
}

function parseLookingFor(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const source = normalizeToken(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const t of source) {
    if (["tous", "all", "everyone"].includes(t)) {
      out.clear();
      out.add("all");
      return out;
    }
    if (["femme", "femmes", "women", "female"].includes(t)) out.add("female");
    else if (["homme", "hommes", "men", "male"].includes(t)) out.add("male");
    else if (["femmes trans", "femme trans", "trans_women", "trans women"].includes(t))
      out.add("trans_female");
    else if (["hommes trans", "homme trans", "trans_men", "trans men"].includes(t))
      out.add("trans_male");
    else if (["non-binaires", "non-binaire", "non_binary", "nonbinary"].includes(t))
      out.add("non_binary");
  }
  return out;
}

function lookingForAcceptsGender(lookingFor: Set<string>, gender: string | null): boolean {
  if (!gender) return false;
  if (lookingFor.has("all")) return true;
  return lookingFor.has(gender);
}

function hasMainPhoto(candidate: DiscoverProfile): boolean {
  return typeof candidate.main_photo_url === "string" && candidate.main_photo_url.trim().length > 0;
}

function isBanned(candidate: DiscoverProfile): boolean {
  if (candidate.is_banned === true) return true;
  if (String(candidate.status ?? "").trim().toLowerCase() === "banned") return true;
  const bannedUntilMs = safeTimeMs(candidate.banned_until);
  return bannedUntilMs > Date.now();
}

/** Exclude hard incompatible inclusivity (viewer « no » vs adapted candidate). */
const INCLUSIVITY_EXCLUDE_THRESHOLD = -10;

export function scoreAndFilterDiscoverCandidates<T extends DiscoverProfile>(
  candidates: T[],
  ctx: DiscoverScoringContext,
): DiscoverScoredCandidate<T>[] {
  const viewerGender = canonicalGender(ctx.viewer.gender);
  const viewerLookingFor = parseLookingFor(ctx.viewer.looking_for);
  const viewerOpenTier = viewerOpenAdaptedResolved(
    ctx.viewer.open_to_adapted_activities ?? null,
    ctx.viewer.pref_open_to_adapted_activity ?? null,
  );

  const kept: DiscoverScoredCandidate<T>[] = [];

  for (const candidate of candidates) {
    const excludedReasons: string[] = [];
    if (!candidate?.id || candidate.id === ctx.viewerId) excludedReasons.push("self");
    if (candidate.profile_completed !== true) excludedReasons.push("incomplete");
    if (isBanned(candidate)) excludedReasons.push("banned");
    if (ctx.likedIds.has(candidate.id)) excludedReasons.push("already_liked");
    if (ctx.matchedIds.has(candidate.id)) excludedReasons.push("already_matched");
    if (ctx.blockedIds?.has(candidate.id)) excludedReasons.push("blocked");
    if (!hasMainPhoto(candidate)) excludedReasons.push("no_main_photo");

    const sharedSports = getSharedSportLabelsForMatch(
      ctx.mySportMatchKeys,
      candidate as {
        profile_sports?: { sports?: { slug?: string | null; label?: string | null } | null }[] | null;
      },
    );
    const sharedCount = sharedSports.length;
    if (sharedCount < 1) excludedReasons.push("no_shared_sports");

    const candidateGender = canonicalGender(candidate.gender);
    const candidateLookingFor = parseLookingFor(candidate.looking_for);
    const meToThem = lookingForAcceptsGender(viewerLookingFor, candidateGender);
    const themToMe = lookingForAcceptsGender(candidateLookingFor, viewerGender);
    if (!meToThem || !themToMe) excludedReasons.push("preference_incompatible");

    const distanceKm = ctx.distanceById.get(candidate.id) ?? null;
    const viewerRadius =
      typeof ctx.viewer.discovery_radius_km === "number" && Number.isFinite(ctx.viewer.discovery_radius_km)
        ? ctx.viewer.discovery_radius_km
        : null;

    if (excludedReasons.length > 0) {
      if (import.meta.env.DEV) {
        console.debug("[Discover scoring V3] excluded", {
          id: candidate.id,
          first_name: candidate.first_name,
          reasons: excludedReasons,
        });
      }
      continue;
    }

    const flags = ctx.sploveFlagsById?.get(candidate.id);
    const boostActive = flags?.boost === true;
    const priorityActive = flags?.priority_meet === true;

    const v3 = evaluateDiscoverV3({
      sharedSportsCount: sharedCount,
      viewerIntent: ctx.viewer.intent,
      candidateIntent: candidate.intent,
      viewerSportTime: ctx.viewer.sport_time,
      candidateSportTime: candidate.sport_time,
      viewerDiscoveryRadiusKm: viewerRadius,
      distanceKm,
      viewerOpenResolved: viewerOpenTier,
      candidateNeedsAdapted: candidate.needs_adapted_activities,
      candidateSportPracticeType: (candidate as { sport_practice_type?: string | null }).sport_practice_type,
      candidatePhotoStatus: candidate.photo_status,
      candidatePhotoVerified: candidate.is_photo_verified,
      candidateProfileCompleted: candidate.profile_completed,
      boostActive,
      priorityMeetActive: priorityActive,
    });

    if (v3.outside_radius) {
      if (import.meta.env.DEV) {
        console.debug("[Discover scoring V3] excluded", {
          id: candidate.id,
          first_name: candidate.first_name,
          reasons: ["outside_radius"],
        });
      }
      continue;
    }
    if (v3.inclusivity_raw < INCLUSIVITY_EXCLUDE_THRESHOLD) {
      if (import.meta.env.DEV) {
        console.debug("[Discover scoring V3] excluded", {
          id: candidate.id,
          first_name: candidate.first_name,
          reasons: ["incompatible_inclusivity"],
        });
      }
      continue;
    }

    const practice_score = practiceCompatibilityScore(
      ctx.viewer.sport_practice_type,
      (candidate as { sport_practice_type?: string | null }).sport_practice_type,
    );

    const cityFallbackBoost = distanceKm == null && isSameCity(ctx.viewer.city, candidate.city) ? 12 : 0;
    const betaSharedSportsBoost = BETA_MODE ? sharedCount * 8 : 0;
    const totalScore = (v3?.total ?? 0) + cityFallbackBoost + betaSharedSportsBoost;
    const reasons: string[] = [`V3 ${Math.round(totalScore)} · ${sharedCount} sport(s) en commun`];
    if (distanceKm != null && Number.isFinite(distanceKm))
      reasons.push(`distance ${Math.round(distanceKm)} km`);
    if (cityFallbackBoost > 0) reasons.push("même ville (fallback beta)");
    if (betaSharedSportsBoost > 0) reasons.push(`beta +${betaSharedSportsBoost} sports communs`);
    if (boostActive) reasons.push("Boost actif");
    if (priorityActive) reasons.push("Priorité rencontre");

    if (import.meta.env.DEV) {
      console.debug("[Discover scoring V3] included", {
        id: candidate.id,
        sharedCount,
        distanceKm,
        practice_score,
        parts: v3,
        score: totalScore,
      });
    }

    kept.push({
      ...candidate,
      commonSportsCount: sharedCount,
      discoverScore: totalScore,
      practice_score,
      distanceKm,
      discover_reasons: reasons,
      discover_excluded: false,
    });
  }

  kept.sort((a, b) => {
    if (b.discoverScore !== a.discoverScore) return b.discoverScore - a.discoverScore;
    if (b.practice_score !== a.practice_score) return b.practice_score - a.practice_score;
    const bActive = safeTimeMs(b.last_active_at);
    const aActive = safeTimeMs(a.last_active_at);
    if (bActive !== aActive) return bActive - aActive;
    return safeTimeMs(b.created_at) - safeTimeMs(a.created_at);
  });

  return kept;
}
