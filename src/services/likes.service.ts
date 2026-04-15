import { supabase } from "../lib/supabase";
import type { LikeReceived, ProfileInLikesYou } from "../types/premium.types";
import { fetchBlockedRelatedUserIds } from "./blocks.service";

/** Retour attendu de `create_like_and_get_result` (snake_case ou camelCase selon PostgREST). */
export type CreateLikeRpcResult = {
  like_created: boolean;
  is_match: boolean;
  match_id: string | null;
  conversation_id: string | null;
};

const PROFILE_SELECT =
  "id, first_name, city, main_photo_url, portrait_url, fullbody_url, sport_feeling, sport_phrase, sport_time, is_photo_verified, profile_sports(sports(label, slug))";

/**
 * Récupère les likes reçus par l'utilisateur avec les profils associés.
 */
export async function getLikesReceived(
  currentUserId: string
): Promise<LikeReceived[]> {
  const blocked = await fetchBlockedRelatedUserIds();
  const { data: likesData, error: likesError } = await supabase
    .from("likes")
    .select("id, liker_id, liked_id, created_at")
    .eq("liked_id", currentUserId)
    .order("created_at", { ascending: false });

  if (likesError) {
    console.error("getLikesReceived", likesError);
    return [];
  }

  if (!likesData?.length) return [];

  const visible = likesData.filter((l) => !blocked.has(l.liker_id));
  if (!visible.length) return [];

  const fromIds = [...new Set(visible.map((l) => l.liker_id))];
  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", fromIds);

  if (profilesError) {
    console.error("getLikesReceived profiles", profilesError);
    return likesData.map((l) => ({
      ...l,
      profile: undefined,
    })) as LikeReceived[];
  }

  const profileMap = new Map<string | undefined, ProfileInLikesYou>();
  ((profilesData as unknown as ProfileInLikesYou[]) || []).forEach((p) => profileMap.set(p.id, p));

  return visible.map((l) => ({
    ...l,
    profile: profileMap.get(l.liker_id),
  })) as LikeReceived[];
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

/** Vérifie qu’une ligne `likes` existe (schéma from_user / to_user ou liker_id / liked_id). */
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
