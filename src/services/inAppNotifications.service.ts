import { supabase } from "../lib/supabase";
import { DISCOVER_BETA_SIMPLE_PIPELINE } from "../lib/discoverBetaPipeline";
import { rpcOptional } from "../lib/optionalSupabase";

/** Phase 1 cloche : événements importants (pas les messages chat). */
export const BELL_NOTIFICATION_KINDS = [
  "new_like",
  "new_match",
  "activity_proposed",
  "activity_accepted",
  "activity_counter",
  "meetup_confirmed",
] as const;

export type InAppNotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  message: string;
  read: boolean;
  exempt_daily_cap?: boolean | null;
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
  created_at: string;
};

function isMissingRpcOrTableError(error: { code?: string | number; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const c = String(error.code ?? "");
  const m = (error.message ?? "").toLowerCase();
  if (c === "42883" || c === "42P01" || c === "PGRST202" || c === "404") return true;
  return m.includes("does not exist") || m.includes("could not find the function") || m.includes("not found");
}

/** Traite les jobs dus pour l’utilisateur courant ; retourne le nombre de notifications non lues. */
export async function pulseInAppNotifications(): Promise<number> {
  if (DISCOVER_BETA_SIMPLE_PIPELINE) return 0;
  const data = await rpcOptional<number | string>(
    "pulse_my_in_app_notifications",
    {},
    "pulse_my_in_app_notifications",
    2_500,
  );
  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (typeof data === "string") {
    const n = Number(data);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchInAppNotifications(limit = 50): Promise<InAppNotificationRow[]> {
  const { data, error } = await supabase
    .from("in_app_notifications")
    .select("id, user_id, kind, title, message, read, exempt_daily_cap, payload, dedupe_key, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    if (error.code === "42P01" || low.includes("does not exist")) {
      return [];
    }
    console.warn("[inAppNotifications] fetch", error.message);
    return [];
  }
  return (data ?? []) as InAppNotificationRow[];
}

export async function markInAppNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("in_app_notifications").update({ read: true }).eq("id", id);
  if (error) {
    console.warn("[inAppNotifications] mark read", error.message);
  }
}

/** Ouverture du centre cloche : tout marquer lu (hors messages chat). */
export async function markAllInAppNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_in_app_notifications_read");
  if (error) {
    if (isMissingRpcOrTableError(error)) {
      const { error: updErr } = await supabase
        .from("in_app_notifications")
        .update({ read: true })
        .eq("read", false);
      if (updErr) console.warn("[inAppNotifications] mark all read fallback", updErr.message);
      return;
    }
    console.warn("[inAppNotifications] mark all read", error.message);
  }
}

export async function countUnreadInAppNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from("in_app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false)
    .in("kind", [...BELL_NOTIFICATION_KINDS]);
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    if (error.code === "42P01" || low.includes("does not exist")) return 0;
    console.warn("[inAppNotifications] count unread", error.message);
    return 0;
  }
  return count ?? 0;
}
