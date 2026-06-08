import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

type PushKind = "like" | "message" | "match";

type RequestBody = {
  recipientUserId?: string;
  kind?: PushKind;
  route?: string;
  conversationId?: string | null;
};

type DeviceTokenRow = {
  token: string;
  platform: "ios" | "android";
  active_route: string | null;
  active_conversation_id: string | null;
  presence_updated_at: string | null;
};

const PUSH_COPY: Record<
  PushKind,
  { title: string; body: string }
> = {
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

const PRESENCE_MAX_AGE_MS = 45_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function sendApns(
  deviceToken: string,
  title: string,
  body: string,
  route: string,
  conversationId: string | null,
  kind: PushKind,
): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: false, error: `apns_${res.status}:${text.slice(0, 200)}` };
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
): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: false, error: `fcm_${res.status}:${text.slice(0, 200)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-splove-push-secret",
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

  const recipientUserId = body.recipientUserId?.trim();
  const kind = body.kind;
  const route = body.route ? normalizeRoute(body.route) : "";
  const conversationId = body.conversationId?.trim() || null;

  if (!recipientUserId || !kind || !route || !(kind in PUSH_COPY)) {
    return jsonResponse({ error: "invalid_payload" }, 400);
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
    .select("token, platform, active_route, active_conversation_id, presence_updated_at")
    .eq("user_id", recipientUserId);

  if (error) {
    console.error("[send-push] load tokens", error.message);
    return jsonResponse({ error: "load_tokens_failed" }, 500);
  }

  const rows = (tokens ?? []) as DeviceTokenRow[];
  if (rows.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: 0, reason: "no_tokens" });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
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

    if (result.ok) sent += 1;
    else if (result.error) errors.push(`${row.platform}:${result.error}`);
  }

  console.log("[send-push]", { kind, recipientUserId, sent, skipped, errors: errors.slice(0, 3) });

  return jsonResponse({ ok: true, sent, skipped, errors });
});
