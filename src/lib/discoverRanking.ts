import type { DiscoverScoreProfileInput } from "./discoverScore";
import { buildDiscoverScore, getSharedSportsCount } from "./discoverScore";
import { getSharedSportLabelsForMatch } from "./sportMatchGroups";
import { isPreferenceCompatible, type PreferenceCompatFields } from "./matchingPreferences";

type RankedProfileBase = DiscoverScoreProfileInput &
  PreferenceCompatFields & {
    id: string;
    first_name?: string | null;
    birth_date?: string | null;
    profile_completed?: boolean | null;
    main_photo_url?: string | null;
    portrait_url?: string | null;
    fullbody_url?: string | null;
    avatar_url?: string | null;
    has_shared_place?: boolean | null;
  };

export type DiscoverHardFilterContext = {
  currentUserId: string;
  viewer: PreferenceCompatFields;
  viewerSportMatchKeys: Set<string>;
  excludedIds: Set<string>;
  matchedIds: Set<string>;
};

function hasApprovedPhoto(p: RankedProfileBase): boolean {
  const hasDisplayPhoto = [p.main_photo_url, p.portrait_url, p.fullbody_url, p.avatar_url]
    .some((url) => typeof url === "string" && url.trim().length > 0);
  const status = String(p.photo_status ?? "").trim().toLowerCase();
  return hasDisplayPhoto && (status === "approved" || p.is_photo_verified === true);
}

export function applyDiscoverHardExclusions<T extends RankedProfileBase>(
  candidates: T[],
  ctx: DiscoverHardFilterContext,
): T[] {
  return candidates.filter((candidate) => {
    if (!candidate?.id || candidate.id === ctx.currentUserId) return false;
    if (ctx.excludedIds.has(candidate.id)) return false;
    if (ctx.matchedIds.has(candidate.id)) return false;
    if (!candidate.first_name?.trim()) return false;
    if (!candidate.gender) return false;
    if (!candidate.birth_date) return false;
    if (candidate.profile_completed !== true) return false;
    if (!hasApprovedPhoto(candidate)) return false;
    if (!isPreferenceCompatible(ctx.viewer, candidate)) return false;
    const sharedSports = getSharedSportsCount(ctx.viewerSportMatchKeys, candidate);
    if (sharedSports <= 0) return false;
    return true;
  });
}

export function rankDiscoverCandidates<T extends RankedProfileBase>(
  candidates: T[],
  context: {
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
    distanceById?: Map<string, number | null>;
  },
): (T & {
  commonSportsCount: number;
  discoverScore: number;
  distanceKm: number | null;
  discover_reasons: string[];
  discover_excluded: boolean;
})[] {
  const scored = candidates.map((candidate) => {
    const discover = buildDiscoverScore(candidate as any, {
      mySportMatchKeys: context.mySportMatchKeys,
      myProfile: context.myProfile,
      distanceKmOverride: context.distanceById?.get(candidate.id),
      hasSharedPlace: candidate.has_shared_place === true,
    });
    return {
      ...candidate,
      commonSportsCount: discover.sharedSportsCount,
      discoverScore: discover.score,
      distanceKm: discover.distanceKm,
      discover_reasons: discover.reasons,
      discover_excluded: discover.excluded,
    };
  });

  return scored
    .filter((p) => !p.discover_excluded && p.commonSportsCount > 0)
    .sort((a, b) => {
      if (b.discoverScore !== a.discoverScore) return b.discoverScore - a.discoverScore;
      if (b.commonSportsCount !== a.commonSportsCount) return b.commonSportsCount - a.commonSportsCount;
      const aShared = getSharedSportLabelsForMatch(context.mySportMatchKeys, a as any).length;
const bShared = getSharedSportLabelsForMatch(context.mySportMatchKeys, b as any).length;
      if (bShared !== aShared) return bShared - aShared;
      return a.id.localeCompare(b.id, "fr");
    });
}
