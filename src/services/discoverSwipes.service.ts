import { supabase } from "../lib/supabase";

export type DiscoverRewindStatus = {
  can_rewind: boolean;
  reason: string | null;
  has_premium: boolean;
  last_action?: string | null;
  last_is_match?: boolean;
  /** Rewinds consommés sur la fenêtre 5 min (côté serveur, `discover_rewind_ledger`). */
  rewind_count?: number;
  /** Plafond gratuit (renvoyé par le serveur, ex. 2). */
  rewind_limit_free?: number;
  /** Horodatage ISO du dernier swipe annulable (le plus récent). */
  last_swipe_at?: string | null;
};

function numOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function rewindFreeLimit(v: unknown): number {
  return typeof v === "number" && v > 0 ? v : 2;
}

export type RecordSwipeResult = { ok: boolean; error?: string | null };
export type RewindResult = { ok: boolean; target_id?: string; action?: string; error?: string | null };

export async function recordDiscoverSwipe(input: {
  targetId: string;
  action: "like" | "pass";
  decisionTimeMs: number;
  isMatch: boolean;
}): Promise<RecordSwipeResult> {
  const { data, error } = await supabase.rpc("record_discover_swipe", {
    p_target_id: input.targetId,
    p_action: input.action,
    p_decision_time_ms: Math.max(0, Math.min(2_147_000_000, Math.round(input.decisionTimeMs))),
    p_is_match: input.isMatch,
  });
  if (error) {
    console.warn("[discoverSwipes] record_discover_swipe", error.message);
    return { ok: false, error: error.message };
  }
  const j = (data ?? null) as { ok?: boolean; error?: string } | null;
  return { ok: Boolean(j?.ok), error: j?.error };
}

export async function getDiscoverRewindStatus(): Promise<DiscoverRewindStatus | null> {
  const { data, error } = await supabase.rpc("get_discover_rewind_status");
  if (error) {
    console.warn("[discoverSwipes] get_discover_rewind_status", error.message);
    return null;
  }
  const d = (data ?? null) as Record<string, unknown> | null;
  if (!d) return null;
  const lastAt = d.last_swipe_at;
  return {
    can_rewind: d.can_rewind === true,
    reason: typeof d.reason === "string" ? d.reason : d.reason == null ? null : String(d.reason),
    has_premium: d.has_premium === true,
    last_action: typeof d.last_action === "string" ? d.last_action : null,
    last_is_match: d.last_is_match === true,
    rewind_count: numOr0(d.rewind_count),
    rewind_limit_free: rewindFreeLimit(d.rewind_limit_free),
    last_swipe_at:
      typeof lastAt === "string"
        ? lastAt
        : lastAt != null
          ? String(lastAt)
          : null,
  };
}

export async function rewindLastDiscoverSwipe(): Promise<RewindResult> {
  const { data, error } = await supabase.rpc("rewind_last_discover_swipe");
  if (error) {
    return { ok: false, error: error.message };
  }
  const d = (data ?? null) as {
    ok?: boolean;
    target_id?: string;
    action?: string;
    error?: string;
  } | null;
  if (!d) return { ok: false, error: "empty" };
  if (!d.ok) return { ok: false, error: d.error ?? "rewind_failed" };
  return {
    ok: true,
    target_id: typeof d.target_id === "string" ? d.target_id : undefined,
    action: typeof d.action === "string" ? d.action : undefined,
  };
}

export type ProfileCrossingRow = {
  target_id: string;
  state: string;
  expires_at: string | null;
};

export async function fetchProfileCrossings(): Promise<ProfileCrossingRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("discover_profile_crossings")
    .select("target_id, state, expires_at, last_interaction_at")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("last_interaction_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    console.warn("[discoverSwipes] crossings", error.message);
    return [];
  }
  return (data ?? []) as ProfileCrossingRow[];
}
