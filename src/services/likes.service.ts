import { supabase } from "../lib/supabase";
import {
  filterLikeRowsByViewerPreference,
  logPreferenceCompatibilityPipeline,
} from "../lib/matchingPreferences";
import { asAgePreferenceScalar, isReciprocalAgeDiscoverMatch } from "../lib/profileAge";
import { getSharedSportsCount, type DiscoverScoreProfileInput } from "../lib/discoverScore";
import { collectSportMatchKeysFromProfile } from "../lib/sportMatchGroups";
import { parseSportMatchPreference } from "../lib/sportMatchPreference";
import type { LikeReceived, ProfileInLikesYou } from "../types/premium.types";
import { fetchBlockedRelatedUserIds } from "./blocks.service";

/** Retour attendu de `create_like_and_get_result` (snake_case ou camelCase selon PostgREST). */
export type CreateLikeRpcResult = {
  like_created: boolean;
  is_match: boolean;
  match_id: string | null;
  conversation_id: string | null;
};

/** Colonnes stables pour liste Likes / preview (pas de `select *`). */
export const LIKES_PROFILE_BATCH_SELECT =
  "id, first_name, city, birth_date, preferred_age_min, preferred_age_max, main_photo_url, portrait_url, fullbody_url, gender, looking_for, sport_feeling, sport_phrase, height_cm, is_photo_verified, photo_status, identity_verified, veriff_status, profile_completed, is_active, is_paused, is_banned, deleted_at, profile_sports(sports(label, slug))";

const PROFILE_SELECT = LIKES_PROFILE_BATCH_SELECT;

type LikesProfileVisibilityFields = {
  profile_completed?: boolean | null;
  is_active?: boolean | null;
  is_paused?: boolean | null;
  is_banned?: boolean | null;
  deleted_at?: string | null;
};

function isLikeProfileVisible(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as LikesProfileVisibilityFields;
  return (
    p.profile_completed === true &&
    p.is_active === true &&
    p.is_paused === false &&
    p.is_banned === false &&
    p.deleted_at == null
  );
}

/** Préférences viewer — alignées Discover / `useAuth().profile` (prioritaires sur la ligne DB si fournies). */
export type ViewerPreferenceFields = {
  gender: string | null | undefined;
  looking_for: string | null | undefined;
  birth_date?: string | null | undefined;
  preferred_age_min?: number | null | undefined;
  preferred_age_max?: number | null | undefined;
  sport_match_preference?: string | null | undefined;
};

/** Même source que Discover (`loadProfiles` lit `profiles` pour le viewer) ; repli Auth si ligne absente. */
function mergeViewerPreferences(
  fromDb: { gender?: string | null; looking_for?: string | null } | null,
  fromAuth: ViewerPreferenceFields | null | undefined,
): { gender: string | null; looking_for: string | null } {
  const gAuth = fromAuth?.gender != null && String(fromAuth.gender).trim() !== "" ? String(fromAuth.gender).trim() : null;
  const lAuth =
    fromAuth?.looking_for != null && String(fromAuth.looking_for).trim() !== ""
      ? String(fromAuth.looking_for).trim()
      : null;
  const gDb = fromDb?.gender != null && String(fromDb.gender).trim() !== "" ? String(fromDb.gender).trim() : null;
  const lDb =
    fromDb?.looking_for != null && String(fromDb.looking_for).trim() !== ""
      ? String(fromDb.looking_for).trim()
      : null;
  return {
    gender: gDb ?? gAuth,
    looking_for: lDb ?? lAuth,
  };
}

function trimmedOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function mergeViewerAgeForLikesYou(
  fromDb: {
    birth_date?: string | null;
    preferred_age_min?: number | string | null;
    preferred_age_max?: number | string | null;
  } | null,
  fromAuth: ViewerPreferenceFields | null | undefined,
): {
  birth_date: string | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
} {
  const birth =
    trimmedOrNull(fromDb?.birth_date) ??
    trimmedOrNull(fromAuth?.birth_date ?? null);

  function pickAgeNum(dbVal: unknown, authVal: unknown): number | null {
    const fromAuthN =
      typeof authVal === "number" && Number.isFinite(authVal)
        ? Math.round(authVal)
        : typeof authVal === "string"
          ? Math.round(Number.parseFloat(authVal))
          : Number.NaN;
    const fromDbN =
      typeof dbVal === "number" && Number.isFinite(dbVal)
        ? Math.round(dbVal as number)
        : typeof dbVal === "string"
          ? Math.round(Number.parseFloat(String(dbVal)))
          : Number.NaN;
    const v = Number.isFinite(fromDbN) ? fromDbN : Number.isFinite(fromAuthN) ? fromAuthN : Number.NaN;
    return Number.isFinite(v) ? v : null;
  }

  return {
    birth_date: birth,
    preferred_age_min: pickAgeNum(fromDb?.preferred_age_min, fromAuth?.preferred_age_min),
    preferred_age_max: pickAgeNum(fromDb?.preferred_age_max, fromAuth?.preferred_age_max),
  };
}

/** Même réciproque que Discover (`isReciprocalAgeDiscoverMatch`). */
function filterLikeRowsByReciprocalAge<T extends { profile?: { birth_date?: string | null } & Record<string, unknown> | null | undefined }>(
  viewerBirth: string | null,
  viewerPreferredMin: number | null,
  viewerPreferredMax: number | null,
  rows: readonly T[],
): T[] {
  return rows.filter((row) => {
    const p = row.profile;
    if (!p || typeof p !== "object") return false;
    return isReciprocalAgeDiscoverMatch(
      {
        birth_date: viewerBirth,
        preferred_age_min: viewerPreferredMin,
        preferred_age_max: viewerPreferredMax,
      },
      {
        birth_date: typeof p.birth_date === "string" ? p.birth_date.trim() || null : null,
        preferred_age_min: asAgePreferenceScalar(
          (p as { preferred_age_min?: unknown }).preferred_age_min,
        ),
        preferred_age_max: asAgePreferenceScalar(
          (p as { preferred_age_max?: unknown }).preferred_age_max,
        ),
      },
    );
  });
}

type IncomingLikeRow = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
};

type MatchRelationRow = {
  id: string;
  user_a: string;
  user_b: string;
  conversation_id?: string | null;
};

/** Likes reçus : `liked_id = moi` (schéma actuel) ou `to_user = moi` (legacy from_user/to_user). */
async function fetchIncomingLikeRows(currentUserId: string): Promise<{
  rows: IncomingLikeRow[];
  error: { message?: string; code?: string } | null;
}> {
  const modern = await supabase
    .from("likes")
    .select("id, liker_id, liked_id, created_at")
    .eq("liked_id", currentUserId)
    .order("created_at", { ascending: false });

  if (!modern.error && modern.data) {
    return { rows: modern.data as IncomingLikeRow[], error: null };
  }

  const msg = modern.error?.message ?? "";
  const retryLegacy =
    /liked_id|liker_id|column|does not exist|42703/i.test(msg) || modern.error?.code === "PGRST204";

  if (!retryLegacy || !modern.error) {
    return { rows: [], error: modern.error };
  }

  console.warn("[likes] fetchIncomingLikeRows: retry with from_user/to_user (legacy schema)");
  const legacy = await supabase
    .from("likes")
    .select("id, from_user, to_user, created_at")
    .eq("to_user", currentUserId)
    .order("created_at", { ascending: false });

  if (legacy.error || !legacy.data) {
    return { rows: [], error: legacy.error ?? modern.error };
  }

  const rows = (legacy.data as { id: string; from_user: string; to_user: string; created_at: string }[]).map(
    (r) => ({
      id: r.id,
      liker_id: r.from_user,
      liked_id: r.to_user,
      created_at: r.created_at,
    }),
  );
  return { rows, error: null };
}

/**
 * Récupère les likes reçus avec profils ; **liste finale = uniquement** via
 * `filterLikeRowsByViewerPreference` → `isPreferenceCompatible` (même pipeline que Discover / SPLove+).
 *
 * @param viewerFromAuth — préférences depuis `AuthContext.profile` (même source effective que l’UI).
 */
export async function getLikesReceived(
  currentUserId: string,
  viewerFromAuth?: ViewerPreferenceFields | null,
): Promise<LikeReceived[]> {
  const blocked = await fetchBlockedRelatedUserIds();
  const { rows: likesData, error: likesError } = await fetchIncomingLikeRows(currentUserId);

  console.log("[likesYou] step: incoming likes query", {
    liked_id: currentUserId,
    rowCount: likesData?.length ?? 0,
    error: likesError?.message ?? null,
    code: likesError?.code ?? null,
  });

  if (likesError) {
    console.error("getLikesReceived", likesError);
    return [];
  }

  if (!likesData?.length) return [];

  const visible = likesData.filter((l) => !blocked.has(l.liker_id));
  console.log("[likesYou] step: after block filter", {
    before: likesData.length,
    after: visible.length,
  });
  if (!visible.length) return [];

  const { data: meRow, error: meErr } = await supabase
    .from("profiles")
    .select("gender, looking_for, birth_date, preferred_age_min, preferred_age_max, sport_match_preference")
    .eq("id", currentUserId)
    .maybeSingle();

  if (meErr) {
    console.warn("[likesYou] viewer row from profiles:", meErr.message);
  }

  const { data: viewerSportsRows } = await supabase
    .from("profile_sports")
    .select("sport_id, sports(id, slug, label)")
    .eq("profile_id", currentUserId);
  const viewerSportKeys = collectSportMatchKeysFromProfile({
    profile_sports: (viewerSportsRows ?? []) as {
      sports?: { slug?: string | null; label?: string | null } | null;
    }[],
  });
  const mergedSportMatchPref =
    trimmedOrNull((meRow as { sport_match_preference?: unknown } | null)?.sport_match_preference) ??
    trimmedOrNull(viewerFromAuth?.sport_match_preference ?? null);

  const meForCompat = mergeViewerPreferences(
    meRow as { gender?: string | null; looking_for?: string | null } | null,
    viewerFromAuth ?? null,
  );

  const meAgePrefs = mergeViewerAgeForLikesYou(
    meRow as {
      birth_date?: string | null;
      preferred_age_min?: number | string | null;
      preferred_age_max?: number | string | null;
    } | null,
    viewerFromAuth ?? null,
  );

  console.log("[likesYou] viewer preferences (DB + Auth merge)", {
    fromAuth: viewerFromAuth ?? null,
    fromDb: {
      gender: (meRow as { gender?: string | null } | null)?.gender ?? null,
      looking_for: (meRow as { looking_for?: string | null } | null)?.looking_for ?? null,
    },
    effective: meForCompat,
  });

  const fromIds = [...new Set(visible.map((l) => l.liker_id))];
  const relationByLikerId = new Map<string, { is_match: boolean; match_id: string | null; conversation_id: string | null }>();

  if (fromIds.length > 0) {
    let matchRows: MatchRelationRow[] = [];
    const relationWithConversationA = await supabase
      .from("matches")
      .select("id, user_a, user_b, conversation_id")
      .eq("user_a", currentUserId)
      .in("user_b", fromIds);
    const relationWithConversationB = await supabase
      .from("matches")
      .select("id, user_a, user_b, conversation_id")
      .eq("user_b", currentUserId)
      .in("user_a", fromIds);

    if (relationWithConversationA.error || relationWithConversationB.error) {
      const relationFallbackA = await supabase
        .from("matches")
        .select("id, user_a, user_b")
        .eq("user_a", currentUserId)
        .in("user_b", fromIds);
      const relationFallbackB = await supabase
        .from("matches")
        .select("id, user_a, user_b")
        .eq("user_b", currentUserId)
        .in("user_a", fromIds);
      if (!relationFallbackA.error && !relationFallbackB.error) {
        matchRows = [
          ...((relationFallbackA.data ?? []) as MatchRelationRow[]),
          ...((relationFallbackB.data ?? []) as MatchRelationRow[]),
        ];
      }
    } else {
      matchRows = [
        ...((relationWithConversationA.data ?? []) as MatchRelationRow[]),
        ...((relationWithConversationB.data ?? []) as MatchRelationRow[]),
      ];
    }

    const matchIdsWithoutConversation = matchRows
      .filter((m) => !m.conversation_id)
      .map((m) => m.id);
    const conversationIdByMatchId = new Map<string, string>();
    if (matchIdsWithoutConversation.length > 0) {
      const convRes = await supabase
        .from("conversations")
        .select("id, match_id")
        .in("match_id", matchIdsWithoutConversation);
      for (const raw of convRes.data ?? []) {
        const row = raw as { id: string; match_id: string };
        if (row.id && row.match_id && !conversationIdByMatchId.has(row.match_id)) {
          conversationIdByMatchId.set(row.match_id, row.id);
        }
      }
    }

    for (const m of matchRows) {
      const likerId = m.user_a === currentUserId ? m.user_b : m.user_a;
      if (!likerId) continue;
      relationByLikerId.set(likerId, {
        is_match: true,
        match_id: m.id,
        conversation_id: m.conversation_id ?? conversationIdByMatchId.get(m.id) ?? null,
      });
    }
  }

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", fromIds);

  if (profilesError) {
    console.error("[likesYou] profiles select failed — returning empty (no raw likes)", profilesError);
    return [];
  }

  const profileMap = new Map<string | undefined, ProfileInLikesYou>();
  ((profilesData as unknown as ProfileInLikesYou[]) || []).forEach((p) => profileMap.set(p.id, p));

  const mapped = visible.map((l) => ({
    ...l,
    is_match: relationByLikerId.get(l.liker_id)?.is_match ?? false,
    match_id: relationByLikerId.get(l.liker_id)?.match_id ?? null,
    conversation_id: relationByLikerId.get(l.liker_id)?.conversation_id ?? null,
    profile: profileMap.get(l.liker_id),
  })) as LikeReceived[];

  const withVisibleProfilesOnly = mapped.filter((row) => isLikeProfileVisible(row.profile));
  const beforeCompat = withVisibleProfilesOnly.length;
  const afterGenderCompat = filterLikeRowsByViewerPreference(meForCompat, withVisibleProfilesOnly);
  const filtered = filterLikeRowsByReciprocalAge(
    meAgePrefs.birth_date,
    meAgePrefs.preferred_age_min,
    meAgePrefs.preferred_age_max,
    afterGenderCompat,
  );

  const afterSportStrict =
    parseSportMatchPreference(mergedSportMatchPref) === "same_sports"
      ? filtered.filter((row) => {
          const p = row.profile;
          if (!p) return false;
          return getSharedSportsCount(viewerSportKeys, p as DiscoverScoreProfileInput) >= 1;
        })
      : filtered;

  logPreferenceCompatibilityPipeline(
    "LikesYou",
    meForCompat,
    beforeCompat,
    afterGenderCompat.length,
    afterGenderCompat.map((r) => r.profile?.first_name?.trim() ?? "").filter(Boolean),
  );

  if (import.meta.env.DEV) {
    console.log("[likesYou] after reciprocal age filter", {
      before_reciprocal_age: afterGenderCompat.length,
      after_sport_strict_same_sports: afterSportStrict.length,
      final: afterSportStrict.length,
    });
  }
  console.log("[VISIBLE_LIKES_COUNT] list_consistency", {
    incoming_raw: likesData.length,
    after_block_filter: visible.length,
    with_profile_visibility_rules: withVisibleProfilesOnly.length,
    final_visible: afterSportStrict.length,
  });

  return afterSportStrict;
}

/** Badge strictement aligné avec la liste réellement visible (mêmes filtres). */
export async function fetchIncomingNonBlockedLikesCount(currentUserId: string): Promise<number> {
  const visible = await getLikesReceived(currentUserId, null);
  const count = visible.length;
  console.log("[VISIBLE_LIKES_COUNT] badge_consistency", {
    currentUserId,
    count,
    has_at_least_one_visible_profile: count > 0,
  });
  return count;
}

function extractLikeRpcRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return extractLikeRpcRow(JSON.parse(data) as unknown);
    } catch {
      return null;
    }
  }
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object") return first as Record<string, unknown>;
    return null;
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const inner = o.result ?? o.record ?? o.row;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
    return o;
  }
  return null;
}

function pickStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function pickBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "true" || t === "t" || t === "1" || t === "yes";
  }
  return false;
}

/**
 * Normalise la charge utile RPC (tableau / objet / clés camelCase / chaîne JSON).
 */
export function normalizeCreateLikeRpcResult(data: unknown): CreateLikeRpcResult | null {
  const raw = extractLikeRpcRow(data);
  if (!raw) return null;
  const g = (a: string, b: string) => raw[a] ?? raw[b];
  return {
    like_created: pickBool(g("like_created", "likeCreated")),
    is_match: pickBool(g("is_match", "isMatch")),
    match_id: pickStr(g("match_id", "matchId")),
    conversation_id: pickStr(g("conversation_id", "conversationId")),
  };
}

/** Indique si la réponse RPC décrit un like ou un match enregistré. */
export function rpcPayloadIndicatesLikeSuccess(normalized: CreateLikeRpcResult | null): boolean {
  if (!normalized) return false;
  if (normalized.is_match) return true;
  if (normalized.like_created) return true;
  if (normalized.match_id) return true;
  if (normalized.conversation_id) return true;
  return false;
}

/**
 * Erreurs typiques fetch / navigateur (hors erreurs métier PostgREST / Postgres).
 */
export function isLikelyNetworkOrTransportError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { message?: string; name?: string };
  const msg = (e.message ?? "").toLowerCase();
  const name = (e.name ?? "").toLowerCase();
  if (name === "typeerror" && (msg.includes("fetch") || msg.includes("network") || msg.includes("failed"))) {
    return true;
  }
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("network request failed")) return true;
  if (msg.includes("networkerror")) return true;
  if (msg.includes("load failed")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("aborted")) return true;
  return false;
}

/** Vérifie qu’une ligne `likes` existe (liker_id / liked_id). */
export async function verifyOutgoingLikeExists(fromUserId: string, toUserId: string): Promise<boolean> {
  
  const r2 = await supabase
    .from("likes")
    .select("id")
    .eq("liker_id", fromUserId)
    .eq("liked_id", toUserId)
    .maybeSingle();
  return Boolean(!r2.error && r2.data);
}

/** Conversation liée au match entre deux utilisateurs (si déjà créée). */
export async function fetchConversationIdForUserPair(userA: string, userB: string): Promise<string | null> {
  const { data: row1 } = await supabase
    .from("matches")
    .select("conversation_id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  const c1 = (row1 as { conversation_id?: string | null } | null)?.conversation_id;
  if (c1) return c1;
  const { data: row2 } = await supabase
    .from("matches")
    .select("conversation_id")
    .eq("user_a", userB)
    .eq("user_b", userA)
    .maybeSingle();
  return (row2 as { conversation_id?: string | null } | null)?.conversation_id ?? null;
}
