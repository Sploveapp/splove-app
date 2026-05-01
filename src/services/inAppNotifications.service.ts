import { supabase } from "../lib/supabase";

export type InAppNotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  message: string;
  read: boolean;
  exempt_daily_cap?: boolean | null;
  created_at: string;
};

/** Traite les jobs dus pour l’utilisateur courant ; retourne le nombre de notifications non lues. */
export async function pulseInAppNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc("pulse_my_in_app_notifications");
  if (error) {
    const low = (error.message ?? "").toLowerCase();
    if (error.code === "42883" || low.includes("does not exist")) {
      return 0;
    }
    console.warn("[inAppNotifications] pulse", error.message);
    return 0;
  }
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
    .select("id, user_id, kind, title, message, read, exempt_daily_cap, created_at")
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
