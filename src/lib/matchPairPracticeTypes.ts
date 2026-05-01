/**
 * Lecture `sport_practice_type` pour le pair lié à une conversation (match SPLove).
 */

import { supabase } from "./supabase";

export type PairSportPracticeTypes = {
  mine: string | null;
  partner: string | null;
};

export async function fetchPairSportPracticeTypes(input: {
  conversationId: string;
  currentUserId: string;
}): Promise<PairSportPracticeTypes | null> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("match_id")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (convErr || !conv?.match_id) return null;

  const { data: mRow, error: mErr } = await supabase
    .from("matches")
    .select("user_a, user_b")
    .eq("id", conv.match_id as string)
    .maybeSingle();
  if (mErr || !mRow) return null;

  const ua = (mRow as { user_a: string; user_b: string }).user_a;
  const ub = (mRow as { user_a: string; user_b: string }).user_b;
  const partner = input.currentUserId === ua ? ub : ua;

  const { data: rows, error: pErr } = await supabase
    .from("profiles")
    .select("id, sport_practice_type")
    .in("id", [input.currentUserId, partner]);
  if (pErr || !rows?.length) return { mine: null, partner: null };

  let mine: string | null = null;
  let partnerP: string | null = null;
  for (const r of rows as { id?: string; sport_practice_type?: string | null }[]) {
    const id = typeof r.id === "string" ? r.id : "";
    const v = r.sport_practice_type ?? null;
    if (id === input.currentUserId) mine = v;
    else if (id === partner) partnerP = v;
  }
  return { mine, partner: partnerP };
}
