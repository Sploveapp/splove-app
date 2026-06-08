import { supabase } from "../lib/supabase";

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
    console.warn("[device_tokens] upsert userId mismatch", {
      sessionUserId: session.user.id,
      requestedUserId: userId,
    });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: userId,
      token: trimmed,
      platform,
      updated_at: now,
    },
    { onConflict: "user_id,platform" },
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

export async function fetchDevicePushTokenStatus(
  userId: string,
  platform: DeviceTokenPlatform,
): Promise<{ hasToken: boolean }> {
  const { data, error } = await supabase
    .from("device_tokens")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", platform)
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

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("device_tokens")
    .update({
      active_route: activeRoute,
      active_conversation_id: activeConversationId,
      presence_updated_at: now,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (error) {
    console.warn("[device_tokens] presence update failed", error.message);
  }
}
