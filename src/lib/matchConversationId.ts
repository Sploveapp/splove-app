import { supabase } from "./supabase";

type MatchRow = { id: string; conversation_id?: string | null };

/**
 * Résout `conversations.id` pour une paire matchée.
 * `matches.conversation_id` n’existe pas dans le schéma repo — lookup via `conversations.match_id`.
 */
export async function fetchConversationIdForUserPair(
  userA: string,
  userB: string,
): Promise<string | null> {
  if (!userA || !userB || userA === userB) return null;

  const loadMatch = async (a: string, b: string): Promise<MatchRow | null> => {
    const withConv = await supabase
      .from("matches")
      .select("id, conversation_id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (!withConv.error && withConv.data) {
      return withConv.data as MatchRow;
    }
    const fallback = await supabase.from("matches").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return fallback.data as MatchRow;
  };

  const m1 = await loadMatch(userA, userB);
  const m2 = m1 ? null : await loadMatch(userB, userA);
  const match = m1 ?? m2;
  if (!match?.id) return null;

  const direct = match.conversation_id;
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();

  const convRes = await supabase.from("conversations").select("id").eq("match_id", match.id).maybeSingle();
  const cid = (convRes.data as { id?: string } | null)?.id;
  return typeof cid === "string" && cid.trim().length > 0 ? cid.trim() : null;
}
