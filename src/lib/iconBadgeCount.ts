import { CHAT_MESSAGES_TABLE, supabase } from "./supabase";
import { countUnreadInAppNotifications } from "../services/inAppNotifications.service";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";

/** Conversations avec au moins un message non lu (aligné AppLayout inbox badge). */
export async function countUnreadMessageConversations(userId: string): Promise<number> {
  if (!userId) return 0;

  const blocked = await fetchBlockedRelatedUserIds();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  const filtered = (matches ?? []).filter((m: { user_a: string; user_b: string }) => {
    const other = m.user_a === userId ? m.user_b : m.user_a;
    return !blocked.has(other);
  });
  const matchIds = filtered.map((m: { id: string }) => m.id);
  if (matchIds.length === 0) return 0;

  const { data: convs } = await supabase.from("conversations").select("id").in("match_id", matchIds);
  const convIds = (convs ?? []).map((c: { id: string }) => c.id);
  if (convIds.length === 0) return 0;

  const { data: unreadRows, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("conversation_id")
    .in("conversation_id", convIds)
    .neq("sender_id", userId)
    .is("read_at", null);

  if (error) {
    console.warn("[iconBadgeCount] unread messages query", error.message);
    return 0;
  }

  return new Set((unreadRows ?? []).map((r: { conversation_id: string }) => r.conversation_id)).size;
}

/** Badge icône = cloche non lue + conversations messages non lus (miroir splove_icon_badge_count). */
export async function computeIconBadgeCount(userId: string): Promise<number> {
  if (!userId) return 0;
  const [bell, inbox] = await Promise.all([
    countUnreadInAppNotifications(),
    countUnreadMessageConversations(userId),
  ]);
  return bell + inbox;
}
