import { getSharedSportLabelsForMatch } from "../lib/sportMatchGroups";

type DiscoverProfile = {
  id: string;
  first_name?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
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
  [key: string]: unknown;
};

type ViewerProfile = {
  id?: string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
};

export type DiscoverScoringContext = {
  viewerId: string;
  viewer: ViewerProfile;
  likedIds: Set<string>;
  matchedIds: Set<string>;
  blockedIds?: Set<string>;
  mySportMatchKeys: Set<string>;
  distanceById: Map<string, number | null>;
};

export type DiscoverScoredCandidate<T extends DiscoverProfile> = T & {
  commonSportsCount: number;
  discoverScore: number;
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
  const source = normalizeToken(raw).split(",").map((x) => x.trim()).filter(Boolean);
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

function parseIntent(raw: string | null | undefined): "sport_social" | "dating" | "both" | null {
  const t = normalizeToken(raw);
  if (!t) return null;
  if (["amical", "friendly", "sport_social"].includes(t)) return "sport_social";
  if (["amoureux", "dating", "dating_feeling"].includes(t)) return "dating";
  if (["both", "les deux"].includes(t)) return "both";
  return null;
}

function hasMainPhoto(candidate: DiscoverProfile): boolean {
  return typeof candidate.main_photo_url === "string" && candidate.main_photo_url.trim().length > 0;
}

function hasTwoPhotos(candidate: DiscoverProfile): boolean {
  const portrait = typeof candidate.portrait_url === "string" && candidate.portrait_url.trim().length > 0;
  const full = typeof candidate.fullbody_url === "string" && candidate.fullbody_url.trim().length > 0;
  return portrait && full;
}

function isBanned(candidate: DiscoverProfile): boolean {
  if (candidate.is_banned === true) return true;
  if (String(candidate.status ?? "").trim().toLowerCase() === "banned") return true;
  const bannedUntilMs = safeTimeMs(candidate.banned_until);
  return bannedUntilMs > Date.now();
}

function getDistancePoints(distanceKm: number | null): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 0;
  if (distanceKm < 5) return 15;
  if (distanceKm < 15) return 10;
  if (distanceKm < 30) return 5;
  return 0;
}

function getActivityPoints(lastActiveAt: string | null | undefined): number {
  const t = safeTimeMs(lastActiveAt);
  if (!t) return 0;
  const hours = (Date.now() - t) / (1000 * 60 * 60);
  if (hours < 24) return 10;
  if (hours < 24 * 7) return 5;
  return 0;
}

function getSportsPoints(sharedCount: number): number {
  if (sharedCount >= 3) return 40;
  if (sharedCount === 2) return 28;
  if (sharedCount === 1) return 15;
  return 0;
}

function getCompletenessBonus(candidate: DiscoverProfile): number {
  let bonus = 0;
  if (candidate.sport_phrase && String(candidate.sport_phrase).trim().length > 0) bonus += 5;
  if (hasTwoPhotos(candidate)) bonus += 5;
  return bonus;
}

export function scoreAndFilterDiscoverCandidates<T extends DiscoverProfile>(
  candidates: T[],
  ctx: DiscoverScoringContext
): DiscoverScoredCandidate<T>[] {
  const viewerGender = canonicalGender(ctx.viewer.gender);
  const viewerLookingFor = parseLookingFor(ctx.viewer.looking_for);
  const viewerIntent = parseIntent(ctx.viewer.intent);

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
      }
    );
    const sharedCount = sharedSports.length;
    if (sharedCount < 1) excludedReasons.push("no_shared_sports");

    const candidateGender = canonicalGender(candidate.gender);
    const candidateLookingFor = parseLookingFor(candidate.looking_for);
    const meToThem = lookingForAcceptsGender(viewerLookingFor, candidateGender);
    const themToMe = lookingForAcceptsGender(candidateLookingFor, viewerGender);
    if (!meToThem || !themToMe) excludedReasons.push("preference_incompatible");

    if (excludedReasons.length > 0) {
      if (import.meta.env.DEV) {
        console.debug("[Discover scoring] excluded", {
          id: candidate.id,
          first_name: candidate.first_name,
          reasons: excludedReasons,
        });
      }
      continue;
    }

    const candidateIntent = parseIntent(candidate.intent);
    const intentCompatible =
      viewerIntent != null &&
      candidateIntent != null &&
      (viewerIntent === "both" || candidateIntent === "both" || viewerIntent === candidateIntent);

    const distanceKm = ctx.distanceById.get(candidate.id) ?? null;
    const score =
      getSportsPoints(sharedCount) +
      (intentCompatible ? 20 : 0) +
      getDistancePoints(distanceKm) +
      getActivityPoints(candidate.last_active_at) +
      getCompletenessBonus(candidate);

    const reasons: string[] = [`${sharedCount} sport(s) en commun`];
    if (intentCompatible) reasons.push("intention compatible");
    const distancePts = getDistancePoints(distanceKm);
    if (distancePts > 0 && distanceKm != null) reasons.push(`distance ${Math.round(distanceKm)} km`);

    if (import.meta.env.DEV) {
      console.debug("[Discover scoring] included", {
        id: candidate.id,
        first_name: candidate.first_name,
        sharedCount,
        intentCompatible,
        distanceKm,
        score,
      });
    }

    kept.push({
      ...candidate,
      commonSportsCount: sharedCount,
      discoverScore: score,
      distanceKm,
      discover_reasons: reasons,
      discover_excluded: false,
    });
  }

  kept.sort((a, b) => {
    if (b.discoverScore !== a.discoverScore) return b.discoverScore - a.discoverScore;
    const bActive = safeTimeMs(b.last_active_at);
    const aActive = safeTimeMs(a.last_active_at);
    if (bActive !== aActive) return bActive - aActive;
    return safeTimeMs(b.created_at) - safeTimeMs(a.created_at);
  });

  return kept;
}

