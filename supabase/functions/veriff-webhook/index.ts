import { createClient } from "npm:@supabase/supabase-js@2";

// Deploy:
// supabase functions deploy veriff-webhook
//
// Set required secrets:
// supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co" SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" VERIFF_WEBHOOK_SECRET="YOUR_VERIFF_SECRET"

type VerificationStatus = "approved" | "declined" | "resubmission_requested";

type ProfileUpdate = {
  verification_level?: number;
  verification_status?: string;
  verification_score?: number;
  verified_at?: string;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

const ALLOWED_METHOD = "POST";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeCompare(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

async function computeHmacSha256Hex(message: string, secret: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return toHex(signature);
}

function getSignatureHeader(req: Request): string | null {
  // Support common header names to avoid brittle integrations.
  return req.headers.get("x-hmac-signature") ??
    req.headers.get("x-veriff-signature") ??
    req.headers.get("x-signature");
}

function getVerificationStatus(payload: Record<string, unknown>): VerificationStatus | null {
  const rootStatus = typeof payload.status === "string" ? payload.status : null;
  const verification =
    payload.verification && typeof payload.verification === "object"
      ? payload.verification as Record<string, unknown>
      : null;
  const verificationStatus = verification && typeof verification.status === "string"
    ? verification.status
    : null;
  const candidate = (verificationStatus ?? rootStatus)?.toLowerCase();

  if (
    candidate === "approved" || candidate === "declined" ||
    candidate === "resubmission_requested"
  ) {
    return candidate;
  }
  return null;
}

function getVendorData(payload: Record<string, unknown>): string | null {
  const rootVendorData = typeof payload.vendorData === "string" ? payload.vendorData : null;
  const verification =
    payload.verification && typeof payload.verification === "object"
      ? payload.verification as Record<string, unknown>
      : null;
  const nestedVendorData = verification && typeof verification.vendorData === "string"
    ? verification.vendorData
    : null;
  const value = nestedVendorData ?? rootVendorData;
  return value && value.trim().length > 0 ? value.trim() : null;
}

function buildProfileUpdate(status: VerificationStatus): ProfileUpdate {
  switch (status) {
    case "approved":
      return {
        verification_level: 3,
        verification_status: "approved",
        verification_score: 100,
        verified_at: new Date().toISOString(),
      };
    case "declined":
      return {
        verification_level: 0,
        verification_status: "rejected",
      };
    case "resubmission_requested":
      return {
        verification_status: "pending_retry",
      };
  }
}

Deno.serve(async (req) => {
  if (req.method !== ALLOWED_METHOD) {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("VERIFF_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("[veriff-webhook] Missing required environment variables");
    return jsonResponse(500, { error: "server_misconfiguration" });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (error) {
    console.error("[veriff-webhook] Unable to read request body", error);
    return jsonResponse(400, { error: "invalid_payload" });
  }

  if (!rawBody || rawBody.trim().length === 0) {
    console.warn("[veriff-webhook] Empty body received");
    return jsonResponse(400, { error: "invalid_payload" });
  }

  const incomingSignature = getSignatureHeader(req)?.trim().toLowerCase();
  if (!incomingSignature) {
    console.warn("[veriff-webhook] Missing signature header");
    return jsonResponse(401, { error: "missing_signature" });
  }

  let expectedSignature: string;
  try {
    expectedSignature = await computeHmacSha256Hex(rawBody, webhookSecret);
  } catch (error) {
    console.error("[veriff-webhook] Failed to compute HMAC", error);
    return jsonResponse(500, { error: "server_error" });
  }

  if (!safeCompare(incomingSignature, expectedSignature)) {
    console.warn("[veriff-webhook] Invalid webhook signature");
    return jsonResponse(401, { error: "invalid_signature" });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn("[veriff-webhook] Payload is not a valid JSON object");
      return jsonResponse(400, { error: "invalid_payload" });
    }
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    console.warn("[veriff-webhook] Invalid JSON payload", error);
    return jsonResponse(400, { error: "invalid_payload" });
  }

  const userId = getVendorData(payload);
  if (!userId) {
    console.warn("[veriff-webhook] Missing vendorData (Supabase user id)");
    return jsonResponse(400, { error: "missing_vendor_data" });
  }

  const status = getVerificationStatus(payload);
  if (!status) {
    console.warn("[veriff-webhook] Unknown verification status", {
      status: payload.status,
      verification: payload.verification,
    });
    return jsonResponse(400, { error: "unknown_status" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const update = buildProfileUpdate(status);

  try {
    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (error) {
      console.error("[veriff-webhook] Failed to update profile", {
        userId,
        status,
        error,
      });
      return jsonResponse(500, { error: "db_update_failed" });
    }
  } catch (error) {
    console.error("[veriff-webhook] Unexpected database error", {
      userId,
      status,
      error,
    });
    return jsonResponse(500, { error: "server_error" });
  }

  console.log("[veriff-webhook] Profile updated", { userId, status });
  return jsonResponse(200, { ok: true });
});
