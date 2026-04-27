import { supabase } from "../lib/supabase";

export type SecondChanceRequestRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  status: "pending" | "accepted" | "ignored";
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  result_match_id: string | null;
  result_conversation_id: string | null;
};

export type CreateSecondChanceResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; requestId?: string };

function parseCreate(data: unknown): CreateSecondChanceResult {
  const j = (data ?? null) as Record<string, unknown> | null;
  if (!j || j.ok !== true) {
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : "unknown",
      requestId: typeof j?.request_id === "string" ? j.request_id : undefined,
    };
  }
  const id = j.request_id;
  if (typeof id !== "string" || !id) return { ok: false, error: "no_request_id" };
  return { ok: true, requestId: id };
}

export async function createSecondChanceRequest(
  recipientId: string,
  message: string
): Promise<CreateSecondChanceResult> {
  const { data, error } = await supabase.rpc("create_second_chance_request", {
    p_recipient_id: recipientId,
    p_message: message,
  });
  if (error) {
    return { ok: false, error: error.message || "rpc_error" };
  }
  return parseCreate(data);
}

export type RespondSecondChanceResult =
  | { ok: true; status: "accepted" | "ignored"; matchId?: string; conversationId?: string }
  | { ok: false; error: string };

export async function respondSecondChanceRequest(
  requestId: string,
  accept: boolean
): Promise<RespondSecondChanceResult> {
  const { data, error } = await supabase.rpc("respond_second_chance_request", {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) {
    return { ok: false, error: error.message || "rpc_error" };
  }
  const j = (data ?? null) as Record<string, unknown> | null;
  if (!j || j.ok !== true) {
    return { ok: false, error: typeof j?.error === "string" ? j.error : "unknown" };
  }
  const st = j.status;
  if (st !== "accepted" && st !== "ignored") {
    return { ok: false, error: "invalid_status" };
  }
  if (st === "accepted") {
    const mid = j.match_id;
    const cid = j.conversation_id;
    return {
      ok: true,
      status: "accepted",
      matchId: typeof mid === "string" ? mid : undefined,
      conversationId: typeof cid === "string" ? cid : undefined,
    };
  }
  return { ok: true, status: "ignored" };
}

export async function fetchPendingSecondChancesForRecipient(
  recipientId: string
): Promise<SecondChanceRequestRow[]> {
  if (!recipientId) return [];
  const { data, error } = await supabase
    .from("second_chance_requests")
    .select(
      "id, sender_id, recipient_id, message, status, created_at, updated_at, responded_at, result_match_id, result_conversation_id"
    )
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    console.warn("[secondChance] fetch pending", error.message);
    return [];
  }
  return (data ?? []) as SecondChanceRequestRow[];
}

export async function fetchSecondChanceRequestById(
  requestId: string
): Promise<SecondChanceRequestRow | null> {
  const { data, error } = await supabase
    .from("second_chance_requests")
    .select(
      "id, sender_id, recipient_id, message, status, created_at, updated_at, responded_at, result_match_id, result_conversation_id"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.warn("[secondChance] fetch by id", error.message);
    }
    return null;
  }
  return data as SecondChanceRequestRow;
}

export async function countPendingSecondChancesForUser(userId: string): Promise<number> {
  const rows = await fetchPendingSecondChancesForRecipient(userId);
  return rows.length;
}
