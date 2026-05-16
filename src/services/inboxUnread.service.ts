import { CHAT_MESSAGES_TABLE, supabase } from "../lib/supabase";

/** Compte les messages reçus non lus par conversation (read_at NULL). */
export async function fetchUnreadCountByConversation(
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userId || conversationIds.length === 0) return out;

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("conversation_id")
    .in("conversation_id", conversationIds)
    .neq("sender_id", userId)
    .is("read_at", null);

  if (error) {
    console.warn("[inboxUnread] fetchUnreadCountByConversation", error.message);
    return out;
  }

  for (const row of data ?? []) {
    const cid = (row as { conversation_id?: string }).conversation_id;
    if (!cid) continue;
    out.set(cid, (out.get(cid) ?? 0) + 1);
  }
  return out;
}
