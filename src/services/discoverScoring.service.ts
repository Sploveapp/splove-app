import { practiceCompatibilityScore } from "../lib/sportPracticeCompatibilityScore";
import { evaluateDiscoverV3, viewerOpenAdaptedResolved } from "../lib/discoverScoreV3";
import { discoverCrossSportSecondaryAllowed } from "@/lib/sportMatchPreference";
import { encodeDiscoverScoringReason } from "@/lib/discoverScoringReasons";
import { BETA_MODE } from "../constants/beta";
import { asAgePreferenceScalar, isReciprocalAgeDiscoverMatch } from "../lib/profileAge";

type DiscoverProfile = {
  id: string;
  first_name?: string | null;
  birth_date?: string | null;
  preferred_age_min?: number | string | null;
  preferred_age_max?: number | string | null;
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
  sport_match_preference?: string | null;
  [key: string]: unknown;
};

type ViewerProfile = {
  id?: string | null;
  city?: string | null;
  profile_completed?: boolean | null;
  birth_date?: string | null;
  preferred_age_min?: number | string | null;
  preferred_age_max?: number | string | null;
  gender?: string | null;
  looking_for?: string | null;
  intent?: string | null;
  sport_practice_type?: string | null;
  sport_time?: string | null;
  open_to_adapted_activities?: string | null;
  pref_open_to_adapted_activity?: boolean | null;
  discovery_radius_km?: number | null;
  sport_match_preference?: string | null;
};

export type DiscoverScoringContext = {
  viewerId: string;
  viewer: ViewerProfile;
  likedIds: Set<string>;
  matchedIds: Set<string>;
  blockedIds?: Set<string>;
  mySportMatchKeys: Set<string>;
  /** Optional direct viewer sport ids from `profile_sports.sport_id` hydration. */
  viewerSportIds?: Array<string | number>;
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

/** Onboarding-looking_for uses `women`/`men`; profile gender uses `female`/`male` — unify before compares. */
function normalizeRelationshipComparableToken(t: string): string {
  if (t === "men") return "male";
  if (t === "women") return "female";
  return t;
}

function isSameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = normalizeToken(a);
  const cb = normalizeToken(b);
  return Boolean(ca && cb && ca === cb);
}

function canonicalGender(raw: string | null | undefined): string | null {
  const t = normalizeRelationshipComparableToken(normalizeToken(raw));
  if (!t) return null;
  if (
    [
      "femme",
      "femmes",
      "female",
      "woman",
      "women",
      "feminin",
      "feminine",
      "femelle",
      "femme cis",
      "female cis",
      "cis female",
      "cis woman",
    ].includes(t)
  ) {
    return "female";
  }
  if (
    [
      "homme",
      "hommes",
      "male",
      "man",
      "men",
      "masculin",
      "masculine",
      "male",
      "homme cis",
      "male cis",
      "cis male",
      "cis man",
    ].includes(t)
  ) {
    return "male";
  }
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
  for (const rawTok of source) {
    const t = normalizeRelationshipComparableToken(rawTok);
    if (["tous", "all", "everyone"].includes(t)) {
      out.clear();
      out.add("all");
      return out;
    }
    if (
      [
        "femme",
        "femmes",
        "women",
        "female",
        "woman",
        "feminin",
        "feminine",
        "femelle",
        "femme cis",
        "female cis",
        "cis female",
        "cis woman",
      ].includes(t)
    ) {
      out.add("female");
    } else if (
      [
        "homme",
        "hommes",
        "men",
        "male",
        "man",
        "masculin",
        "masculine",
        "male",
        "homme cis",
        "male cis",
        "cis male",
        "cis man",
      ].includes(t)
    ) {
      out.add("male");
    }
    else if (["femmes trans", "femme trans", "trans_women", "trans women"].includes(t))
      out.add("trans_female");
    else if (["hommes trans", "homme trans", "trans_men", "trans men"].includes(t))
      out.add("trans_male");
    else if (["non-binaires", "non-binaire", "non_binary", "nonbinary"].includes(t))
      out.add("non_binary");
  }
  return out;
}


function extractNormalizedSportIdsFromValue(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  const add = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "number" && Number.isFinite(v)) {
      out.add(String(v));
      return;
    }
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return;
      out.add(t);
    }
  };
  if (Array.isArray(raw)) {
    for (const x of raw) add(x);
    return out;
  }
  add(raw);
  return out;
}

function extractViewerSportIds(ctx: DiscoverScoringContext): Set<string> {
  const out = new Set<string>();
  const maybeViewerSportIds = (ctx as { viewerSportIds?: unknown }).viewerSportIds;
  for (const id of extractNormalizedSportIdsFromValue(maybeViewerSportIds)) out.add(id);
  for (const key of ctx.mySportMatchKeys) {
    const t = String(key ?? "").trim();
    const m = t.match(/^id:(.+)$/i);
    if (m?.[1]) out.add(m[1].trim());
  }
  return out;
}

function extractCandidateSportIds(candidate: DiscoverProfile): Set<string> {
  const out = new Set<string>();
  const list = (candidate as { profile_sports?: unknown }).profile_sports;
  if (!Array.isArray(list)) return out;
  for (const row of list as Array<Record<string, unknown> | null>) {
    if (!row || typeof row !== "object") continue;
    for (const id of extractNormalizedSportIdsFromValue(row.sport_id)) out.add(id);
    const sports = row.sports;
    if (Array.isArray(sports)) {
      for (const sportObj of sports as Array<Record<string, unknown> | null>) {
        if (!sportObj || typeof sportObj !== "object") continue;
        for (const id of extractNormalizedSportIdsFromValue(sportObj.id)) out.add(id);
      }
    } else if (sports && typeof sports === "object") {
      for (const id of extractNormalizedSportIdsFromValue((sports as Record<string, unknown>).id)) out.add(id);
    }
  }
  return out;
}

function intersectSportIds(a: Set<string>, b: Set<string>): string[] {
  if (a.size === 0 || b.size === 0) return [];
  const small = a.size <= b.size ? a : b;
  const big = small === a ? b : a;
  const out: string[] = [];
  for (const id of small) {
    if (big.has(id)) out.push(id);
  }
  return out;
}

function normalizeIntentForDiag(raw: string | null | undefined): string {
  const t = normalizeToken(raw);
  if (!t) return "";
  if (["amoureux", "serious", "love", "dating"].some((x) => t.includes(x))) return "dating";
  if (["amical", "friends", "friendly", "sport_social"].some((x) => t.includes(x))) return "sport_social";
  if (["both", "open", "les deux", "lesdeux"].some((x) => t.includes(x.replace(/\s+/g, "")))) return "both";
  return t;
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

/** Score secondaire léger lorsque 0 sport commun mais ouverture cross-sport (reste bien sous sportPointsV3(1)). */
const CROSS_SPORT_SECONDARY_SCORE_BONUS = 10;

/** Dev diagnostics: always surface these first names when present in the candidate pool. */
const DISCOVER_DIAG_NAME_RE = /\b(bruno|sofiane)\b/i;

function isDiscoverDiagHighlightName(firstName: string | null | undefined): boolean {
  return typeof firstName === "string" && DISCOVER_DIAG_NAME_RE.test(firstName.trim());
}

function exclusionDetailForNoMainPhoto(candidate: DiscoverProfile): {
  reason: "rejected photo" | "pending photo" | "missing required field";
  photo_status: string | null;
} {
  const st = String(candidate.photo_status ?? "")
    .trim()
    .toLowerCase();
  if (st === "rejected") return { reason: "rejected photo", photo_status: candidate.photo_status ?? null };
  if (st === "pending" || st === "review") return { reason: "pending photo", photo_status: candidate.photo_status ?? null };
  return { reason: "missing required field", photo_status: candidate.photo_status ?? null };
}

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
  const viewerSportIds = extractViewerSportIds(ctx);

  const kept: DiscoverScoredCandidate<T>[] = [];

  if (import.meta.env.DEV) {
    console.info("[Discover diagnostics] scoring input", {
      candidate_count: candidates.length,
      viewer_id: ctx.viewerId,
      viewer_sport_match_key_count: ctx.mySportMatchKeys.size,
      viewer_sport_ids: [...viewerSportIds],
      viewer_gender_normalized: viewerGender,
      viewer_looking_for_normalized: [...viewerLookingFor],
      viewer_intent_normalized: normalizeIntentForDiag(ctx.viewer.intent ?? null),
      viewer_sport_ids_missing: viewerSportIds.size === 0,
    });
  }

  if (import.meta.env.DEV && candidates.length > 0) {
    const probeViewerSports = extractViewerSportIds(ctx);
    let ageReciprocalPass = 0;
    let sportCompatPass = 0;
    for (const c of candidates) {
      const cr = c as { preferred_age_min?: unknown; preferred_age_max?: unknown };
      if (
        isReciprocalAgeDiscoverMatch(
          {
            birth_date: ctx.viewer.birth_date ?? null,
            preferred_age_min: asAgePreferenceScalar(ctx.viewer.preferred_age_min),
            preferred_age_max: asAgePreferenceScalar(ctx.viewer.preferred_age_max),
          },
          {
            birth_date: c.birth_date ?? null,
            preferred_age_min: asAgePreferenceScalar(cr.preferred_age_min),
            preferred_age_max: asAgePreferenceScalar(cr.preferred_age_max),
          },
        )
      ) {
        ageReciprocalPass += 1;
      }
      const sharedN = intersectSportIds(probeViewerSports, extractCandidateSportIds(c)).length;
      if (
        sharedN >= 1 ||
        discoverCrossSportSecondaryAllowed(ctx.viewer.sport_match_preference, c.sport_match_preference)
      ) {
        sportCompatPass += 1;
      }
    }
    console.info("[Discover diagnostics] pipeline_filter_counts", {
      note: "Isolated checks on scoring input (likes/blocks already stripped upstream).",
      candidate_count: candidates.length,
      age_reciprocal_pass: ageReciprocalPass,
      sport_compat_pass: sportCompatPass,
    });
  }

  for (const candidate of candidates) {
    const excludedReasons: string[] = [];
    const diagExtra: Record<string, unknown> = {};
    if (!candidate?.id || candidate.id === ctx.viewerId) excludedReasons.push("self");
    if (ctx.viewer.profile_completed !== true) excludedReasons.push("viewer incomplete");
    if (candidate.profile_completed !== true) excludedReasons.push("incomplete");
    if (isBanned(candidate)) {
      excludedReasons.push("missing required field");
      diagExtra.banned = true;
    }
    if (ctx.likedIds.has(candidate.id)) excludedReasons.push("already liked");
    if (ctx.matchedIds.has(candidate.id)) excludedReasons.push("already matched");
    if (ctx.blockedIds?.has(candidate.id)) excludedReasons.push("blocked");
    if (!hasMainPhoto(candidate)) {
      const d = exclusionDetailForNoMainPhoto(candidate);
      excludedReasons.push(d.reason);
      if (d.photo_status != null) diagExtra.photo_status = d.photo_status;
    }

    const candidateSportIds = extractCandidateSportIds(candidate);
    const commonSportIds = intersectSportIds(viewerSportIds, candidateSportIds);
    const sharedCount = commonSportIds.length;
    const allowZeroSharedSports =
      sharedCount >= 1 ||
      discoverCrossSportSecondaryAllowed(ctx.viewer.sport_match_preference, candidate.sport_match_preference);
    if (!allowZeroSharedSports) excludedReasons.push("no common sport");

    const candidateGender = canonicalGender(candidate.gender);
    const candidateLookingFor = parseLookingFor(candidate.looking_for);
    const meToThem = lookingForAcceptsGender(viewerLookingFor, candidateGender);
    const themToMe = lookingForAcceptsGender(candidateLookingFor, viewerGender);
    if (!meToThem) excludedReasons.push("looking_for mismatch");
    if (!themToMe) excludedReasons.push("gender mismatch");

    const candRec = candidate as { preferred_age_min?: unknown; preferred_age_max?: unknown };
    const ageReciprocal = isReciprocalAgeDiscoverMatch(
      {
        birth_date: ctx.viewer.birth_date ?? null,
        preferred_age_min: asAgePreferenceScalar(ctx.viewer.preferred_age_min),
        preferred_age_max: asAgePreferenceScalar(ctx.viewer.preferred_age_max),
      },
      {
        birth_date: candidate.birth_date ?? null,
        preferred_age_min: asAgePreferenceScalar(candRec.preferred_age_min),
        preferred_age_max: asAgePreferenceScalar(candRec.preferred_age_max),
      },
    );
    if (!ageReciprocal) excludedReasons.push("age preference");

    const mismatchReasons: string[] = [];
    if (!meToThem) mismatchReasons.push("viewer_looking_for_does_not_accept_candidate_gender");
    if (!themToMe) mismatchReasons.push("candidate_looking_for_does_not_accept_viewer_gender");

    diagExtra.viewer_sport_ids = [...viewerSportIds];
    diagExtra.candidate_sport_ids = [...candidateSportIds];
    diagExtra.shared_sport_ids = commonSportIds;
    diagExtra.viewer_gender_raw = ctx.viewer.gender ?? null;
    diagExtra.viewer_looking_for_raw = ctx.viewer.looking_for ?? null;
    diagExtra.viewer_intent_raw = ctx.viewer.intent ?? null;
    diagExtra.candidate_gender_raw = candidate.gender ?? null;
    diagExtra.candidate_looking_for_raw = candidate.looking_for ?? null;
    diagExtra.candidate_intent_raw = candidate.intent ?? null;
    diagExtra.viewer_gender_normalized = viewerGender;
    diagExtra.candidate_gender_normalized = candidateGender;
    diagExtra.viewer_looking_for_normalized = [...viewerLookingFor];
    diagExtra.candidate_looking_for_normalized = [...candidateLookingFor];
    diagExtra.viewer_intent_normalized = normalizeIntentForDiag(ctx.viewer.intent ?? null);
    diagExtra.candidate_intent_normalized = normalizeIntentForDiag(candidate.intent ?? null);
    diagExtra.match_check_me_to_them = meToThem;
    diagExtra.match_check_them_to_me = themToMe;
    diagExtra.exact_mismatch_reason = mismatchReasons;

    const distanceKm = ctx.distanceById.get(candidate.id) ?? null;
    const viewerRadius =
      typeof ctx.viewer.discovery_radius_km === "number" && Number.isFinite(ctx.viewer.discovery_radius_km)
        ? ctx.viewer.discovery_radius_km
        : null;
    const sameCity = isSameCity(ctx.viewer.city, candidate.city);
    const hasGpsDistance = distanceKm != null && Number.isFinite(distanceKm);
    const insideRadius = hasGpsDistance && viewerRadius != null && viewerRadius > 0 ? distanceKm <= viewerRadius : false;
    // Beta fallback: do not exclude solely because GPS is missing.
    // If other hard constraints pass (shared sport + compatibility + safety checks), candidate may pass without distance.
    const gpsMissingSharedSportFallback =
      sharedCount >= 1 && !sameCity && !hasGpsDistance;
    const locationAccepted = sameCity || insideRadius || gpsMissingSharedSportFallback;
    const distanceSource: "gps" | "missing_gps_shared_sport_fallback" = hasGpsDistance
      ? "gps"
      : "missing_gps_shared_sport_fallback";
    if (!locationAccepted) {
      excludedReasons.push("outside discovery radius");
    }

    diagExtra.viewer_city = ctx.viewer.city ?? null;
    diagExtra.candidate_city = candidate.city ?? null;
    diagExtra.same_city = sameCity;
    diagExtra.distance_km = distanceKm;
    diagExtra.distance_source = distanceSource;
    diagExtra.discovery_radius_km = viewerRadius;

    if (excludedReasons.length > 0) {
      if (import.meta.env.DEV) {
        const hl = isDiscoverDiagHighlightName(candidate.first_name);
        const row = {
          first_name: candidate.first_name ?? null,
          id: candidate.id ?? null,
          exclusion_reason: excludedReasons,
          distance_km: distanceKm,
          ...diagExtra,
          ...(hl ? { diag_highlight_name: true } : {}),
        };
        if (hl) console.info("[Discover diagnostics] scoring excluded (Bruno/Sofiane)", row);
        else console.info("[Discover diagnostics] scoring excluded", row);
      }
      continue;
    }

    if (import.meta.env.DEV) {
      const hl = isDiscoverDiagHighlightName(candidate.first_name);
      const n = String(candidate.first_name ?? "").trim().toLowerCase();
      const isTarget = /\b(linda|jacob)\b/i.test(n);
      if (hl || isTarget) {
        console.info("[Discover diagnostics] compatibility accepted", {
          first_name: candidate.first_name ?? null,
          id: candidate.id ?? null,
          exclusion_reason: [],
          viewer_city: ctx.viewer.city ?? null,
          candidate_city: candidate.city ?? null,
          same_city: sameCity,
          distance_km: distanceKm,
          discovery_radius_km: viewerRadius,
          viewer_sport_ids: [...viewerSportIds],
          candidate_sport_ids: [...candidateSportIds],
          shared_sport_ids: commonSportIds,
          viewer_gender_raw: ctx.viewer.gender ?? null,
          viewer_looking_for_raw: ctx.viewer.looking_for ?? null,
          viewer_intent_raw: ctx.viewer.intent ?? null,
          candidate_gender_raw: candidate.gender ?? null,
          candidate_looking_for_raw: candidate.looking_for ?? null,
          candidate_intent_raw: candidate.intent ?? null,
          viewer_gender_normalized: viewerGender,
          candidate_gender_normalized: candidateGender,
          viewer_looking_for_normalized: [...viewerLookingFor],
          candidate_looking_for_normalized: [...candidateLookingFor],
          viewer_intent_normalized: normalizeIntentForDiag(ctx.viewer.intent ?? null),
          candidate_intent_normalized: normalizeIntentForDiag(candidate.intent ?? null),
          match_check_me_to_them: meToThem,
          match_check_them_to_me: themToMe,
          exact_mismatch_reason: mismatchReasons,
        });
      }
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

    if (v3.outside_radius && !sameCity) {
      if (import.meta.env.DEV) {
        const hl = isDiscoverDiagHighlightName(candidate.first_name);
        const row = {
          first_name: candidate.first_name ?? null,
          id: candidate.id ?? null,
          exclusion_reason: ["distance/GPS"],
          outside_radius: true,
          viewer_city: ctx.viewer.city ?? null,
          candidate_city: candidate.city ?? null,
          same_city: sameCity,
          distance_km: distanceKm,
          discovery_radius_km: viewerRadius,
          viewer_sport_ids: [...viewerSportIds],
          candidate_sport_ids: [...candidateSportIds],
          shared_sport_ids: commonSportIds,
          ...(hl ? { diag_highlight_name: true } : {}),
        };
        if (hl) console.info("[Discover diagnostics] scoring excluded (Bruno/Sofiane)", row);
        else console.info("[Discover diagnostics] scoring excluded", row);
      }
      continue;
    }
    if (v3.inclusivity_raw < INCLUSIVITY_EXCLUDE_THRESHOLD) {
      if (import.meta.env.DEV) {
        const hl = isDiscoverDiagHighlightName(candidate.first_name);
        const row = {
          first_name: candidate.first_name ?? null,
          id: candidate.id ?? null,
          exclusion_reason: ["missing required field"],
          inclusivity_blocked: true,
          inclusivity_raw: v3.inclusivity_raw,
          ...(hl ? { diag_highlight_name: true } : {}),
        };
        if (hl) console.info("[Discover diagnostics] scoring excluded (Bruno/Sofiane)", row);
        else console.info("[Discover diagnostics] scoring excluded", row);
      }
      continue;
    }

    const practice_score = practiceCompatibilityScore(
      ctx.viewer.sport_practice_type,
      (candidate as { sport_practice_type?: string | null }).sport_practice_type,
    );

    const cityFallbackBoost = distanceKm == null && isSameCity(ctx.viewer.city, candidate.city) ? 12 : 0;
    const betaSharedSportsBoost = BETA_MODE ? sharedCount * 8 : 0;
    const crossSportSecondaryBonus =
      sharedCount === 0 &&
      discoverCrossSportSecondaryAllowed(ctx.viewer.sport_match_preference, candidate.sport_match_preference)
        ? CROSS_SPORT_SECONDARY_SCORE_BONUS
        : 0;
    const totalScore = (v3?.total ?? 0) + cityFallbackBoost + betaSharedSportsBoost + crossSportSecondaryBonus;
    const reasons: string[] = [];
    if (sharedCount >= 1) {
      reasons.push(
        encodeDiscoverScoringReason("discover_scoring_v3_primary_shared", {
          total: Math.round(totalScore),
          shared: sharedCount,
        }),
      );
    } else {
      reasons.push(
        encodeDiscoverScoringReason("discover_scoring_v3_primary_cross_secondary", {
          total: Math.round(totalScore),
        }),
      );
    }
    if (distanceKm != null && Number.isFinite(distanceKm)) {
      reasons.push(
        encodeDiscoverScoringReason("discover_scoring_distance_km", { km: Math.round(distanceKm) }),
      );
    }
    if (cityFallbackBoost > 0) reasons.push(encodeDiscoverScoringReason("discover_scoring_same_city_fallback_beta"));
    if (gpsMissingSharedSportFallback) {
      reasons.push(encodeDiscoverScoringReason("discover_scoring_gps_beta_shared_sport"));
    }
    if (crossSportSecondaryBonus > 0) {
      reasons.push(
        encodeDiscoverScoringReason("discover_scoring_cross_sport_bonus", {
          bonus: crossSportSecondaryBonus,
        }),
      );
    }
    if (betaSharedSportsBoost > 0) {
      reasons.push(
        encodeDiscoverScoringReason("discover_scoring_beta_shared_sports_boost", {
          pts: betaSharedSportsBoost,
        }),
      );
    }
    if (boostActive) reasons.push(encodeDiscoverScoringReason("discover_scoring_boost_active"));
    if (priorityActive) reasons.push(encodeDiscoverScoringReason("discover_scoring_priority_meet"));

    if (import.meta.env.DEV && isDiscoverDiagHighlightName(candidate.first_name)) {
      console.info("[Discover diagnostics] scoring included (Bruno/Sofiane)", {
        id: candidate.id,
        first_name: candidate.first_name,
        sharedCount,
        distance_km: distanceKm,
        shared_sport_ids: commonSportIds,
        practice_score,
        discoverScore: totalScore,
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
    if (b.commonSportsCount !== a.commonSportsCount) return b.commonSportsCount - a.commonSportsCount;
    const bActive = safeTimeMs(b.last_active_at);
    const aActive = safeTimeMs(a.last_active_at);
    if (bActive !== aActive) return bActive - aActive;
    return safeTimeMs(b.created_at) - safeTimeMs(a.created_at);
  });

  return kept;
}
