import { supabase } from "../lib/supabase";
import { resolvePushEnvironment } from "../lib/pushEnvironment";
import { Capacitor } from "@capacitor/core";

export type DeviceTokenPlatform = "ios" | "android";

export async function upsertDevicePushToken(
  userId: string,
  token: string,
  platform: DeviceTokenPlatform,
): Promise<{ ok: boolean; error?: string; code?: string; details?: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "empty_token" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "no_auth_session", code: "no_session" };
  }
  if (session.user.id !== userId) {
    if (import.meta.env.DEV) {
      console.warn("[device_tokens] upsert blocked — userId mismatch", {
        sessionUserId: session.user.id,
        requestedUserId: userId,
      });
    }
    return { ok: false, error: "user_id_mismatch", code: "user_id_mismatch" };
  }

  const pushEnvironment = resolvePushEnvironment();
  const now = new Date().toISOString();
  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: userId,
      token: trimmed,
      platform,
      push_environment: pushEnvironment,
      updated_at: now,
    },
    { onConflict: "user_id,platform,push_environment" },
  );

  if (error) {
    console.warn("[device_tokens] upsert failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      userId,
      platform,
    });
    return {
      ok: false,
      error: error.message,
      code: error.code,
      details: typeof error.details === "string" ? error.details : JSON.stringify(error.details),
    };
  }
  return { ok: true };
}

/** Supprime le token push de l’utilisateur courant (déconnexion / changement de compte). */
export async function deleteDevicePushToken(userId: string): Promise<void> {
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") return;

  const pushEnvironment = resolvePushEnvironment();
  const { error } = await supabase
    .from("device_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("push_environment", pushEnvironment);

  if (error) {
    console.warn("[device_tokens] delete failed", error.message);
  }
}

/**
 * Un même appareil ne doit pas rester associé à un ancien compte après reconnexion.
 * Supprime les lignes portant ce token pour d’autres user_id avant upsert.
 */
export async function reclaimDevicePushTokenForUser(
  token: string,
  platform: DeviceTokenPlatform,
  userId: string,
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;

  const pushEnvironment = resolvePushEnvironment();
  const { error } = await supabase
    .from("device_tokens")
    .delete()
    .eq("token", trimmed)
    .eq("platform", platform)
    .eq("push_environment", pushEnvironment)
    .neq("user_id", userId);

  if (error) {
    console.warn("[device_tokens] reclaim token failed", error.message);
  }
}

export async function fetchDevicePushTokenStatus(
  userId: string,
  platform: DeviceTokenPlatform,
): Promise<{ hasToken: boolean }> {
  const pushEnvironment = resolvePushEnvironment();
  const { data, error } = await supabase
    .from("device_tokens")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("push_environment", pushEnvironment)
    .maybeSingle();

  if (error) {
    console.warn("[device_tokens] fetch status failed", error.message);
    return { hasToken: false };
  }
  return { hasToken: Boolean(data?.id) };
}

export async function updateDevicePushPresence(
  userId: string,
  activeRoute: string,
  activeConversationId: string | null,
): Promise<void> {
  if (!userId || !activeRoute) return;

  const pushEnvironment = resolvePushEnvironment();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("device_tokens")
    .update({
      active_route: activeRoute,
      active_conversation_id: activeConversationId,
      presence_updated_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("push_environment", pushEnvironment);

  if (error) {
    console.warn("[device_tokens] presence update failed", error.message);
  }
}
