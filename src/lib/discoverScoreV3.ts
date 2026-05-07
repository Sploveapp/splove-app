/**
 * Discover scoring V3 — real-life meeting probability (SPLove).
 * Pure functions; exclusions applied in discoverScoring.service.
 */

import { parseSportPracticePace } from "./sportPracticePace";
import { normalizeIntent } from "./profileIntent";

export function normalizeDiscoverToken(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_, -]+/g, "");
}

export type DiscoverIntentTier = "sport_social" | "dating" | "both" | null;

export function parseDiscoverIntentTier(raw: string | null | undefined): DiscoverIntentTier {
  const normalized = normalizeIntent(raw);
  if (normalized === "love") return "dating";
  if (normalized === "friends") return "sport_social";
  if (normalized === "both" || normalized === "open") return "both";

  const t = normalizeDiscoverToken(raw);
  if (!t) return null;
  const compact = t.replace(/\s+/g, "");
  if (t.includes("both") || compact.includes("lesdeux")) return "both";
  if (["amical", "friendly", "sport_social", "sport social"].some((x) => t.includes(x.replace(/\s+/g, ""))))
    return "sport_social";
  if (["amoureux", "dating"].some((x) => t.includes(x))) return "dating";
  return null;
}

/** Same intent 15, neutral 8, opposite -10 */
export function intentPointsV3(viewerRaw: string | null | undefined, candidateRaw: string | null | undefined): number {
  const v = parseDiscoverIntentTier(viewerRaw);
  const c = parseDiscoverIntentTier(candidateRaw);
  if (!v || !c) return 8;
  if (v === "both" || c === "both") return 8;
  if (v === c) return 15;
  return -10;
}

/** 1→15, 2→25, 3+→30 (caller requires ≥1 shared sport) */
export function sportPointsV3(sharedCount: number): number {
  if (sharedCount <= 0) return 0;
  if (sharedCount === 1) return 15;
  if (sharedCount === 2) return 25;
  return 30;
}

export type DistanceV3Result = { points: number; outside_radius: boolean };

/**
 * <5km 20, <15 15, <30 10, else still inside viewer radius 5.
 * Excludes when distance known and beyond viewer discovery radius.
 */
export function distancePointsV3(
  distanceKm: number | null,
  viewerRadiusKm: number | null | undefined,
): DistanceV3Result {
  const r =
    viewerRadiusKm != null && Number.isFinite(viewerRadiusKm) && viewerRadiusKm > 0
      ? viewerRadiusKm
      : null;
  if (distanceKm != null && Number.isFinite(distanceKm) && r != null && distanceKm > r) {
    return { points: 0, outside_radius: true };
  }
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { points: 0, outside_radius: false };
  }
  if (distanceKm < 5) return { points: 20, outside_radius: false };
  if (distanceKm < 15) return { points: 15, outside_radius: false };
  if (distanceKm < 30) return { points: 10, outside_radius: false };
  return { points: 5, outside_radius: false };
}

export function canonSportTimeBucket(raw: string | null | undefined): string | null {
  const t = normalizeDiscoverToken(raw);
  if (!t) return null;
  if (t.includes("matin") || t.includes("morning")) return "morning";
  if (t.includes("soir") || t.includes("evening")) return "evening";
  if (t.includes("apres") && t.includes("midi")) return "afternoon";
  if (t.includes("midi") || t.includes("afternoon")) return "afternoon";
  if (t.includes("week") || t.includes("weekend")) return "weekend";
  if (t.includes("flex") || t.includes("dispo") || t.includes("depend")) return "flexible";
  return t.replace(/\s+/g, "_");
}

/** Perfect 10 if same bucket; else partial 5 */
export function timingPointsV3(
  viewerSportTime: string | null | undefined,
  candidateSportTime: string | null | undefined,
): number {
  const v = canonSportTimeBucket(viewerSportTime);
  const c = canonSportTimeBucket(candidateSportTime);
  if (v && c && v === c) return 10;
  return 5;
}

export type OpenAdaptedTier = "totally" | "depends" | "unsure" | "no" | null;

export function parseOpenAdaptedActivities(raw: string | null | undefined): OpenAdaptedTier {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "yes_totally") return "totally";
  if (t === "yes_depends_sport") return "depends";
  if (t === "unsure") return "unsure";
  if (t === "no") return "no";
  return null;
}

export function viewerOpenAdaptedResolved(
  openColumn: string | null | undefined,
  prefLegacy: boolean | null | undefined,
): OpenAdaptedTier {
  const p = parseOpenAdaptedActivities(openColumn);
  if (p) return p;
  if (prefLegacy === false) return "no";
  if (prefLegacy === true) return "totally";
  return null;
}

export function candidateHasAdaptedPractice(
  needsAdapted: boolean | null | undefined,
  sportPracticeType: string | null | undefined,
): boolean {
  if (needsAdapted === true) return true;
  return parseSportPracticePace(sportPracticeType) === "adapted";
}

export function inclusivityPointsV3(viewerOpen: OpenAdaptedTier, candidateHasAdapted: boolean): number {
  if (!candidateHasAdapted) return 0;
  switch (viewerOpen) {
    case "totally":
      return 15;
    case "depends":
      return 8;
    case "unsure":
      return 0;
    case "no":
      return -20;
    default:
      return 0;
  }
}

/** Verified +5, complete profile +5 */
export function profileQualityPointsV3(input: {
  photo_status?: string | null;
  is_photo_verified?: boolean | null;
  profile_completed?: boolean | null;
}): number {
  let s = 0;
  const approved = String(input.photo_status ?? "").trim().toLowerCase() === "approved";
  if (approved || input.is_photo_verified === true) s += 5;
  if (input.profile_completed === true) s += 5;
  return s;
}

export function sploveBoostPremiumPoints(boostActive: boolean, priorityMeetActive: boolean): number {
  let n = 0;
  if (boostActive) n += 20;
  if (priorityMeetActive) n += 10;
  return n;
}

export type DiscoverV3Parts = {
  sport: number;
  distance: number;
  intent: number;
  timing: number;
  inclusivity: number;
  quality: number;
  boost: number;
};

export function evaluateDiscoverV3(input: {
  sharedSportsCount: number;
  viewerIntent: string | null | undefined;
  candidateIntent: string | null | undefined;
  viewerSportTime: string | null | undefined;
  candidateSportTime: string | null | undefined;
  viewerDiscoveryRadiusKm: number | null | undefined;
  distanceKm: number | null;
  viewerOpenResolved: OpenAdaptedTier;
  candidateNeedsAdapted: boolean | null | undefined;
  candidateSportPracticeType: string | null | undefined;
  candidatePhotoStatus: string | null | undefined;
  candidatePhotoVerified: boolean | null | undefined;
  candidateProfileCompleted: boolean | null | undefined;
  boostActive: boolean;
  priorityMeetActive: boolean;
}): DiscoverV3Parts & { total: number; outside_radius: boolean; inclusivity_raw: number } {
  const sport = sportPointsV3(input.sharedSportsCount);
  const dist = distancePointsV3(input.distanceKm, input.viewerDiscoveryRadiusKm);
  const intent = intentPointsV3(input.viewerIntent, input.candidateIntent);
  const timing = timingPointsV3(input.viewerSportTime, input.candidateSportTime);
  const candAdapted = candidateHasAdaptedPractice(
    input.candidateNeedsAdapted,
    input.candidateSportPracticeType,
  );
  const inclusivity_raw = inclusivityPointsV3(input.viewerOpenResolved, candAdapted);
  const quality = profileQualityPointsV3({
    photo_status: input.candidatePhotoStatus,
    is_photo_verified: input.candidatePhotoVerified,
    profile_completed: input.candidateProfileCompleted,
  });
  const boost = sploveBoostPremiumPoints(input.boostActive, input.priorityMeetActive);
  const parts: DiscoverV3Parts = {
    sport,
    distance: dist.points,
    intent,
    timing,
    inclusivity: inclusivity_raw,
    quality,
    boost,
  };
  const total = sport + dist.points + intent + timing + inclusivity_raw + quality + boost;
  return { ...parts, total, outside_radius: dist.outside_radius, inclusivity_raw };
}
