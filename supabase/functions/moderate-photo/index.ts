import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { buildInternalNormalizedScores } from "./normalizedScores.ts";
import { scoreFromLabels, type NormalizedModerationLabels } from "./risk.ts";
import { callSightengine, labelsFromSightengineJson } from "./sightengine.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "profile-photos";

type Body = {
  user_id?: string;
  photo_slot?: number;
  storage_path?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rejectionCodeFromUi(ui?: string): string | null {
  if (!ui) return null;
  const m: Record<string, string> = {
    face_not_visible: "face_not_detected",
    multiple_people: "group_photo",
    irrelevant_photo: "not_personal",
    heavy_filters: "non_compliant",
    safety_rules: "non_compliant",
  };
  return m[ui] ?? "non_compliant";
}

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

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const storagePath = typeof body.storage_path === "string" ? body.storage_path.trim() : "";
  const photoSlot = Number(body.photo_slot);

  if (!userId || !storagePath || (photoSlot !== 1 && photoSlot !== 2)) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  if (!storagePath.startsWith(`${userId}/`)) {
    return jsonResponse({ error: "storage_path_mismatch" }, 403);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id || userData.user.id !== userId) {
    return jsonResponse({ error: "unauthorized" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
  if (dlErr || !fileBlob) {
    return jsonResponse({ error: "download_failed", detail: dlErr?.message ?? null }, 400);
  }

  const ab = await fileBlob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const mime = fileBlob.type || "image/jpeg";

  const apiUser = Deno.env.get("SIGHTENGINE_API_USER") ?? "";
  const apiSecret = Deno.env.get("SIGHTENGINE_API_SECRET") ?? "";
  const stubApproved = (Deno.env.get("MODERATION_STUB_APPROVED") ?? "") === "1";

  let provider = "none";
  let providerPayload: unknown = null;
  let labels: NormalizedModerationLabels;

  if (apiUser && apiSecret) {
    try {
      providerPayload = await callSightengine(bytes, mime, apiUser, apiSecret);
      provider = "sightengine";
      labels = labelsFromSightengineJson(providerPayload, photoSlot);
    } catch (e) {
      console.error("[moderate-photo] sightengine error", e);
      labels = { textHeavyOrNonProfile: true, lowQuality: true };
      provider = "sightengine_error";
      providerPayload = { error: String(e) };
    }
  } else if (stubApproved) {
    provider = "stub_approved";
    labels = {};
    providerPayload = { stub: true };
  } else {
    provider = "stub_pending";
    labels = { textHeavyOrNonProfile: true, lowQuality: true };
    providerPayload = { stub: true, pending: true };
  }

  const decision = scoreFromLabels(labels, photoSlot);
  const status = decision.band;
  const uiReasonCode = decision.uiReasonCode;
  const normalizedScores = buildInternalNormalizedScores(labels, photoSlot);

  const labelsJson: Record<string, unknown> = {
    normalized: normalizedScores,
    provider_response: providerPayload,
  };

  const { error: insErr } = await admin.from("photo_moderation_results").insert({
    user_id: userId,
    photo_slot: photoSlot,
    storage_path: storagePath,
    status,
    provider,
    provider_labels: labelsJson,
    risk_score: decision.riskScore,
    decision_reason: decision.decisionReason,
  });

  if (insErr) {
    console.error("[moderate-photo] insert result", insErr);
    return jsonResponse({ error: "persist_result_failed", detail: insErr.message }, 500);
  }

  const patch: Record<string, unknown> = {};
  if (photoSlot === 1) {
    patch.photo1_status = status;
    patch.portrait_rejection_code = status === "rejected" ? rejectionCodeFromUi(uiReasonCode) : null;
  } else {
    patch.photo2_status = status;
    patch.body_rejection_code = status === "rejected" ? rejectionCodeFromUi(uiReasonCode) : null;
  }

  if (status === "rejected") {
    const { data: row, error: readErr } = await admin
      .from("profiles")
      .select("moderation_strikes_count")
      .eq("id", userId)
      .maybeSingle();
    if (!readErr) {
      const prev = typeof row?.moderation_strikes_count === "number" ? row.moderation_strikes_count : 0;
      patch.moderation_strikes_count = prev + 1;
    }
  }

  const { error: upErr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (upErr) {
    console.error("[moderate-photo] profile update", upErr);
    return jsonResponse({ error: "profile_update_failed", detail: upErr.message }, 500);
  }

  return jsonResponse({
    status,
    risk_score: decision.riskScore,
    decision_reason: decision.decisionReason,
    ui_reason_code: uiReasonCode ?? null,
    provider,
    normalized: normalizedScores,
  });
});
