import { supabase } from "./supabase";
import { parseProfileIntent, PROFILE_INTENT_AMOUR } from "./profileIntent";
import { isStrictFemmeHommePair } from "./chatFirstMessagePolicy";

export type EnsureConversationWindowParams = {
  conversationId: string;
  userId: string;
  /** Qui a complété le match (2e like) — conservé pour l’API ; la fenêtre utilise le couple réel des profils. */
  matchedByUserId: string | null;
};

/**
 * Garantit une ligne `conversation_windows` pour la conversation : fenêtre 48h + `allowed_first_sender_id`.
 * Insert : seul l’utilisateur courant peut créer la ligne (RLS : `match_initiator_id` = auth.uid()).
 * - `allowed_first_sender_id` = UUID de la femme si couple Femme+Homme **tous deux Amoureux** ; sinon `NULL` (les deux peuvent écrire le premier message).
 */
export async function ensureConversationWindow(params: EnsureConversationWindowParams): Promise<void> {
  const { conversationId, userId } = params;

  try {
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("match_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convErr || !conv?.match_id) {
      console.warn("[ensureConversationWindow] conversation:", convErr?.message ?? "no match_id");
      return;
    }

    const { data: mRow, error: mErr } = await supabase
      .from("matches")
      .select("user_a, user_b")
      .eq("id", conv.match_id as string)
      .maybeSingle();

    if (mErr || !mRow) {
      console.warn("[ensureConversationWindow] match:", mErr?.message ?? "missing");
      return;
    }

    const ua = (mRow as { user_a: string; user_b: string }).user_a;
    const ub = (mRow as { user_a: string; user_b: string }).user_b;
    if (userId !== ua && userId !== ub) return;

    const partnerId = userId === ua ? ub : ua;

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, gender, intent")
      .in("id", [userId, partnerId]);

    if (pErr || !profiles || profiles.length < 2) {
      console.warn("[ensureConversationWindow] profiles:", pErr?.message ?? "incomplete");
      return;
    }

    const pSelf = profiles.find((p: { id: string }) => p.id === userId);
    const pPartner = profiles.find((p: { id: string }) => p.id === partnerId);
    if (!pSelf || !pPartner) return;

    const intentSelf = parseProfileIntent(pSelf.intent);
    const intentPartner = parseProfileIntent(pPartner.intent);
    const bothAmour =
      intentSelf === PROFILE_INTENT_AMOUR && intentPartner === PROFILE_INTENT_AMOUR;

    let allowedFirstSenderId: string | null = null;
    if (bothAmour && isStrictFemmeHommePair(pSelf.gender, pPartner.gender)) {
      const femme = profiles.find((p: { gender?: string | null }) =>
        String(p.gender ?? "").trim().toLowerCase() === "femme",
      );
      allowedFirstSenderId = femme?.id ?? null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    const { data: existing, error: fetchErr } = await supabase
      .from("conversation_windows")
      .select("conversation_id, window_expires_at")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (fetchErr) {
      console.warn("[ensureConversationWindow] select cw:", fetchErr.message);
      return;
    }

    const patch: Record<string, unknown> = {
      allowed_first_sender_id: allowedFirstSenderId,
    };
    if (!(existing as { window_expires_at?: string | null } | null)?.window_expires_at) {
      patch.window_expires_at = expiresAt;
    }

    if (!existing) {
      const { error: insErr } = await supabase.from("conversation_windows").insert({
        conversation_id: conversationId,
        match_initiator_id: userId,
        allowed_first_sender_id: allowedFirstSenderId,
        window_expires_at: expiresAt,
      });
      if (insErr) {
        const dup = insErr.code === "23505" || /duplicate|unique/i.test(insErr.message ?? "");
        if (dup) {
          const { error: upAfterRace } = await supabase
            .from("conversation_windows")
            .update(patch)
            .eq("conversation_id", conversationId);
          if (upAfterRace) console.warn("[ensureConversationWindow] update after race:", upAfterRace.message);
        } else {
          console.warn("[ensureConversationWindow] insert:", insErr.message);
        }
      }
      return;
    }

    const { error: upErr } = await supabase
      .from("conversation_windows")
      .update(patch)
      .eq("conversation_id", conversationId);

    if (upErr) {
      console.warn("[ensureConversationWindow] update:", upErr.message);
    }
  } catch (e) {
    console.warn("[ensureConversationWindow]", e instanceof Error ? e.message : e);
  }
}
