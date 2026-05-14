import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  confirmPhrase?: string;
};

function isMissingOptionalCleanupTarget(error: { code?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (body.confirmPhrase !== "SUPPRIMER") {
    return jsonResponse({ error: "confirmation_invalid" }, 400);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user?.id) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const userId = user.id;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: messagesError } = await admin.from("messages").delete().eq("sender_id", userId);
  if (messagesError && !isMissingOptionalCleanupTarget(messagesError)) {
    console.error("[delete-my-account] messages delete failed", messagesError);
    return jsonResponse({ error: "delete_messages_failed" }, 500);
  }

  // Deux deletes : évite les soucis de parsing `.or()` PostgREST avec certains UUID / proxies.
  const { error: matchErrA } = await admin.from("matches").delete().eq("user_a", userId);
  const { error: matchErrB } = await admin.from("matches").delete().eq("user_b", userId);
  const matchesError = matchErrA ?? matchErrB;
  if (matchesError) {
    console.error("[delete-my-account] matches delete failed", matchesError);
    return jsonResponse({ error: "delete_matches_failed" }, 500);
  }

  // Other related public rows cascade from profiles/auth FKs; delete the profile before the auth user.
  const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
  if (profileError) {
    console.error("[delete-my-account] profile delete failed", profileError);
    return jsonResponse({ error: "delete_profile_failed" }, 500);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("[delete-my-account] auth user delete failed", authError);
    return jsonResponse({ error: "delete_auth_user_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
