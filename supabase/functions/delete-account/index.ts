import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Body = { confirmPhrase?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !anonKey) {
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
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const uid = user.id;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: msgErr } = await admin.from("messages").delete().eq("sender_id", uid);
  if (msgErr) {
    console.error("[delete-account] messages delete", msgErr);
    return jsonResponse({ error: msgErr.message ?? "delete_messages_failed" }, 500);
  }

  const { error: matchErr } = await admin
    .from("matches")
    .delete()
    .or(`user_a.eq.${uid},user_b.eq.${uid}`);
  if (matchErr) {
    console.error("[delete-account] matches delete", matchErr);
    return jsonResponse({ error: matchErr.message ?? "delete_matches_failed" }, 500);
  }

  const { error: profileErr } = await admin.from("profiles").delete().eq("id", uid);
  if (profileErr) {
    console.error("[delete-account] profiles delete", profileErr);
    return jsonResponse({ error: profileErr.message ?? "delete_profile_failed" }, 500);
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) {
    console.error("[delete-account] auth delete", authErr);
    return jsonResponse({ error: authErr.message ?? "delete_auth_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
