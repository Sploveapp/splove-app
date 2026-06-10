import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

type PushKind = "like" | "message" | "match";
type PushEnvironment = "development" | "staging" | "production";

type RequestBody = {
  recipientUserId?: string;
  kind?: PushKind;
  route?: string;
  conversationId?: string | null;
  pushEnvironment?: string;
  triggerSource?: string;
  /** Broadcast — bloqué sauf confirmation admin explicite (jamais depuis les triggers SQL). */
  broadcast?: boolean;
  adminUserId?: string;
  adminConfirmationCode?: string;
};

type DeviceTokenRow = {
  token: string;
  platform: "ios" | "android";
  push_environment: string;
  active_route: string | null;
  active_conversation_id: string | null;
  presence_updated_at: string | null;
};

const PUSH_COPY: Record<PushKind, { title: string; body: string }> = {
  like: {
    title: "Nouveau like sur SPLove 💜",
    body: "Découvre son profil dans tes likes :)",
  },
  message: {
    title: "Nouveau message 💬",
    body: "Tu as reçu un nouveau message sur SPLove.",
  },
  match: {
    title: "C'est un match 💘",
    body: "Vous pouvez lancer l'échange sur SPLove.",
  },
};

const VALID_PUSH_ENVS = new Set<PushEnvironment>(["development", "staging", "production"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRESENCE_MAX_AGE_MS = 45_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePushEnvironment(value: string | undefined | null): PushEnvironment | null {
  const v = value?.trim().toLowerCase();
  if (v === "production" || v === "prod") return "production";
  if (v === "staging" || v === "stage") return "staging";
  if (v === "development" || v === "dev" || v === "local") return "development";
  if (v && VALID_PUSH_ENVS.has(v as PushEnvironment)) return v as PushEnvironment;
  return null;
}

function configuredPushEnvironment(): PushEnvironment {
  return normalizePushEnvironment(Deno.env.get("SPLove_PUSH_ENV")) ?? "production";
}

function isDevOnlyLog(): boolean {
  const env = configuredPushEnvironment();
  return env !== "production" || Deno.env.get("SPLove_PUSH_VERBOSE_LOGS") === "true";
}

function pushLog(event: string, detail: Record<string, unknown>): void {
  if (!isDevOnlyLog() && event !== "push_send_audit") return;
  console.log(`[send-push] ${event}`, detail);
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed.split("?")[0]! : `/${trimmed.split("?")[0]!}`;
}

function shouldSkipForPresence(
  row: DeviceTokenRow,
  kind: PushKind,
  route: string,
  conversationId: string | null,
): boolean {
  if (!row.presence_updated_at) return false;
  const age = Date.now() - Date.parse(row.presence_updated_at);
  if (!Number.isFinite(age) || age > PRESENCE_MAX_AGE_MS) return false;

  const activeRoute = normalizeRoute(row.active_route ?? "");

  if (kind === "like" && (activeRoute === "/likes-you" || activeRoute.startsWith("/likes-you/"))) {
    return true;
  }

  if (kind === "message" && conversationId && row.active_conversation_id === conversationId) {
    return true;
  }

  if (kind === "match" && conversationId) {
    if (row.active_conversation_id === conversationId) return true;
    const matchRoute = `/match/${conversationId}`;
    if (activeRoute === matchRoute || activeRoute.startsWith(`${matchRoute}/`)) return true;
  }

  if (activeRoute === route || activeRoute.startsWith(`${route}/`)) {
    return true;
  }

  return false;
}

function apnsConfigMatchesEnvironment(pushEnv: PushEnvironment): { ok: boolean; reason?: string } {
  const apnsProduction = Deno.env.get("APNS_PRODUCTION") === "true";
  if (pushEnv === "production" && !apnsProduction) {
    return { ok: false, reason: "apns_sandbox_blocked_for_production_env" };
  }
  if (pushEnv === "development" && apnsProduction) {
    return { ok: false, reason: "apns_production_blocked_for_development_env" };
  }
  return { ok: true };
}

async function writePushAuditLog(
  admin: ReturnType<typeof createClient>,
  entry: {
    pushEnvironment: PushEnvironment;
    triggerSource: string;
    kind: string | null;
    title: string | null;
    body: string | null;
    route: string | null;
    recipientUserId: string | null;
    recipientCount: number;
    sentCount: number;
    skippedCount: number;
    adminUserId: string | null;
    payload: Record<string, unknown>;
    errors: string[];
  },
): Promise<void> {
  const { error } = await admin.from("push_send_audit_log").insert({
    push_environment: entry.pushEnvironment,
    trigger_source: entry.triggerSource,
    kind: entry.kind,
    title: entry.title,
    body: entry.body,
    route: entry.route,
    recipient_user_id: entry.recipientUserId,
    recipient_count: entry.recipientCount,
    sent_count: entry.sentCount,
    skipped_count: entry.skippedCount,
    admin_user_id: entry.adminUserId,
    payload: entry.payload,
    errors: entry.errors.length > 0 ? entry.errors : null,
  });

  if (error) {
    console.error("[send-push] audit_log_failed", error.message);
  } else {
    pushLog("push_send_audit", {
      pushEnvironment: entry.pushEnvironment,
      triggerSource: entry.triggerSource,
      kind: entry.kind,
      recipientUserId: entry.recipientUserId,
      recipientCount: entry.recipientCount,
      sentCount: entry.sentCount,
      skippedCount: entry.skippedCount,
      adminUserId: entry.adminUserId,
      at: new Date().toISOString(),
    });
  }
}

let apnsJwtCache: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  if (apnsJwtCache && apnsJwtCache.exp > now + 60) {
    return apnsJwtCache.token;
  }

  const pem = privateKey.includes("BEGIN PRIVATE KEY")
    ? privateKey
    : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  apnsJwtCache = { token, exp: now + 3300 };
  return token;
}

function isInvalidApnsToken(status: number, body: string): boolean {
  return status === 410 || /Unregistered|BadDeviceToken|DeviceTokenNotForTopic/i.test(body);
}

function isInvalidFcmToken(status: number, body: string): boolean {
  return status === 404 || /UNREGISTERED|NOT_FOUND|InvalidRegistration/i.test(body);
}

async function sendApns(
  deviceToken: string,
  title: string,
  body: string,
  route: string,
  conversationId: string | null,
  kind: PushKind,
): Promise<{ ok: boolean; error?: string; invalidToken?: boolean }> {
  const jwt = await getApnsJwt();
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.splove.app";
  if (!jwt) return { ok: false, error: "apns_not_configured" };

  const production = Deno.env.get("APNS_PRODUCTION") === "true";
  const host = production ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const payload = {
    aps: {
      alert: { title, body },
      sound: "default",
      "mutable-content": 0,
    },
    route,
    kind,
    conversationId: conversationId ?? "",
  };

  const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `apns_${res.status}:${text.slice(0, 200)}`,
      invalidToken: isInvalidApnsToken(res.status, text),
    };
  }
  return { ok: true };
}

let fcmAccessTokenCache: { token: string; exp: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;

  let sa: { client_email: string; private_key: string; project_id: string };
  try {
    sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (fcmAccessTokenCache && fcmAccessTokenCache.exp > now + 60) {
    return fcmAccessTokenCache.token;
  }

  const pem = sa.private_key.replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenRes.ok) return null;
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) return null;

  fcmAccessTokenCache = { token: tokenJson.access_token, exp: now + 3300 };
  return tokenJson.access_token;
}

async function sendFcm(
  deviceToken: string,
  title: string,
  body: string,
  route: string,
  conversationId: string | null,
  kind: PushKind,
): Promise<{ ok: boolean; error?: string; invalidToken?: boolean }> {
  const accessToken = await getFcmAccessToken();
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!accessToken || !raw) return { ok: false, error: "fcm_not_configured" };

  const sa = JSON.parse(raw) as { project_id: string };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data: {
            route,
            kind,
            conversationId: conversationId ?? "",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "splove_default",
              icon: "ic_launcher",
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `fcm_${res.status}:${text.slice(0, 200)}`,
      invalidToken: isInvalidFcmToken(res.status, text),
    };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "content-type, x-splove-push-secret, x-splove-push-environment",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
  const incoming = req.headers.get("X-Splove-Push-Secret") ?? "";
  if (!secret || incoming !== secret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const serverPushEnv = configuredPushEnvironment();
  const requestPushEnv =
    normalizePushEnvironment(body.pushEnvironment) ??
    normalizePushEnvironment(req.headers.get("X-Splove-Push-Environment")) ??
    serverPushEnv;

  if (requestPushEnv !== serverPushEnv) {
    return jsonResponse(
      {
        error: "push_environment_mismatch",
        server: serverPushEnv,
        request: requestPushEnv,
      },
      403,
    );
  }

  const triggerSource = body.triggerSource?.trim() || "edge_function";
  const isBroadcastRequest =
    body.broadcast === true ||
    body.recipientUserId?.trim() === "all" ||
    body.recipientUserId?.trim() === "*";

  if (isBroadcastRequest) {
    const allowBroadcast = Deno.env.get("SPLove_ALLOW_BROADCAST") === "true";
    const confirmSecret = Deno.env.get("SPLove_BROADCAST_CONFIRM_SECRET") ?? "";
    const incomingConfirm = body.adminConfirmationCode?.trim() ?? "";
    const adminUserId = body.adminUserId?.trim() ?? null;

    if (!allowBroadcast || !confirmSecret || incomingConfirm !== confirmSecret) {
      return jsonResponse({ error: "broadcast_requires_admin_confirmation" }, 403);
    }

    if (!adminUserId || !UUID_RE.test(adminUserId)) {
      return jsonResponse({ error: "broadcast_requires_admin_user_id" }, 400);
    }

    return jsonResponse(
      {
        error: "broadcast_not_implemented",
        message:
          "Les envois globaux ne sont pas activés. Utiliser un outil admin dédié avec audit.",
      },
      501,
    );
  }

  const recipientUserId = body.recipientUserId?.trim();
  const kind = body.kind;
  const route = body.route ? normalizeRoute(body.route) : "";
  const conversationId = body.conversationId?.trim() || null;

  if (!recipientUserId || !UUID_RE.test(recipientUserId) || !kind || !route || !(kind in PUSH_COPY)) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const apnsGuard = apnsConfigMatchesEnvironment(serverPushEnv);
  if (!apnsGuard.ok) {
    console.error("[send-push] apns_environment_guard", {
      pushEnvironment: serverPushEnv,
      reason: apnsGuard.reason,
    });
    return jsonResponse({ error: apnsGuard.reason }, 503);
  }

  const copy = PUSH_COPY[kind];

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokens, error } = await admin
    .from("device_tokens")
    .select(
      "token, platform, push_environment, active_route, active_conversation_id, presence_updated_at",
    )
    .eq("user_id", recipientUserId)
    .eq("push_environment", serverPushEnv);

  if (error) {
    console.error("[send-push] load tokens", error.message);
    return jsonResponse({ error: "load_tokens_failed" }, 500);
  }

  const rows = (tokens ?? []) as DeviceTokenRow[];

  const auditBase = {
    pushEnvironment: serverPushEnv,
    triggerSource,
    kind,
    title: copy.title,
    body: copy.body,
    route,
    recipientUserId,
    recipientCount: rows.length,
    adminUserId: body.adminUserId?.trim() || null,
    payload: {
      kind,
      route,
      conversationId,
      pushEnvironment: serverPushEnv,
      triggerSource,
    },
  };

  if (rows.length === 0) {
    await writePushAuditLog(admin, {
      ...auditBase,
      sentCount: 0,
      skippedCount: 0,
      errors: ["no_tokens_for_environment"],
    });
    return jsonResponse({ ok: true, sent: 0, skipped: 0, reason: "no_tokens" });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (row.push_environment !== serverPushEnv) {
      skipped += 1;
      errors.push(`${row.platform}:env_mismatch`);
      continue;
    }

    if (shouldSkipForPresence(row, kind, route, conversationId)) {
      skipped += 1;
      continue;
    }

    const result =
      row.platform === "ios"
        ? await sendApns(row.token, copy.title, copy.body, route, conversationId, kind)
        : row.platform === "android"
          ? await sendFcm(row.token, copy.title, copy.body, route, conversationId, kind)
          : { ok: false, error: "unknown_platform" };

    if (result.ok) {
      sent += 1;
    } else if (result.error) {
      errors.push(`${row.platform}:${result.error}`);
      if (result.invalidToken) {
        await admin
          .from("device_tokens")
          .delete()
          .eq("user_id", recipientUserId)
          .eq("platform", row.platform)
          .eq("push_environment", serverPushEnv);
      }
    }
  }

  await writePushAuditLog(admin, {
    ...auditBase,
    sentCount: sent,
    skippedCount: skipped,
    errors,
  });

  pushLog("send_complete", {
    kind,
    recipientUserId,
    pushEnvironment: serverPushEnv,
    sent,
    skipped,
    errors: errors.slice(0, 3),
  });

  return jsonResponse({ ok: true, sent, skipped, errors });
});
