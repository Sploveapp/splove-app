/**
 * Redact OAuth tokens, sessions, and PII from console output (Xcode / Safari).
 * Side-effect: installed on first import from main.tsx.
 */
import type { Session, User } from "@supabase/supabase-js";
import { redactOAuthUrl, redactUserId } from "./oauthLogSanitize";

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token",
  "code",
  "authorization",
  "apikey",
  "password",
  "device_token",
  "push_token",
]);

/** Champs identifiants — tronqués en production. */
const ID_LIKE_KEYS = new Set([
  "id",
  "userid",
  "user_id",
  "profile_id",
  "profileid",
  "liker_id",
  "liked_id",
  "viewer_id",
  "blocker_id",
  "blocked_id",
  "reporter_id",
  "reported_id",
  "conversationid",
  "conversation_id",
  "auth_user_id",
  "sessionuserid",
  "requesteduserid",
  "target_id",
  "match_id",
  "from_user",
  "to_user",
]);

/** PII profil — masqués en production. */
const PII_KEYS = new Set([
  "first_name",
  "birth_date",
  "city",
  "latitude",
  "longitude",
  "phone",
  "email",
]);

const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function truncatePhotoUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  return withoutQuery.length <= 96 ? withoutQuery : `${withoutQuery.slice(0, 96)}…`;
}

function isProd(): boolean {
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.PROD);
}

function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "[redacted-email]";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function extractProvider(user: User | undefined): string | null {
  if (!user) return null;
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  if (typeof meta?.provider === "string") return meta.provider;
  const identities = user.identities as Array<{ provider?: string }> | undefined;
  return identities?.[0]?.provider ?? null;
}

function sanitizeSession(value: unknown): Record<string, unknown> {
  const s = value as Session;
  return {
    hasSession: Boolean(s?.user?.id),
    userId: redactUserId(s?.user?.id),
    provider: extractProvider(s?.user),
    expires_at: s?.expires_at ?? null,
  };
}

function sanitizeUser(value: unknown): Record<string, unknown> {
  const u = value as User;
  return {
    userId: redactUserId(u?.id),
    provider: extractProvider(u),
    hasEmail: Boolean(u?.email),
  };
}

function sanitizeString(value: string): string {
  if (JWT_PATTERN.test(value) || value.length > 80 && value.startsWith("eyJ")) {
    return "[redacted-token]";
  }
  if (
    SENSITIVE_KEYS.has(value) ||
    /access_token|refresh_token|provider_token/i.test(value) ||
    (value.includes("://") && /[?#&](access_token|refresh_token|code)=/i.test(value))
  ) {
    return redactOAuthUrl(value);
  }
  if (value.includes("@") && !value.includes(" ")) {
    return redactEmail(value);
  }
  return value;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth]";
  if (value == null) return value;

  if (typeof value === "string") return sanitizeString(value);

  if (typeof value !== "object") return value;

  if (value instanceof Error) {
    return { name: value.name, message: sanitizeString(value.message) };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  const record = value as Record<string, unknown>;

  if ("access_token" in record || "refresh_token" in record) {
    return {
      hasAccessToken: Boolean(record.access_token),
      hasRefreshToken: Boolean(record.refresh_token),
      token_type: record.token_type ?? null,
    };
  }

  if ("session" in record && record.session && typeof record.session === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === "session") out[k] = sanitizeSession(v);
      else if (k === "user" && v && typeof v === "object") out[k] = sanitizeUser(v);
      else if (k === "error" && v && typeof v === "object") {
        const err = v as { message?: string; name?: string };
        out[k] = { name: err.name ?? "Error", message: err.message ?? null };
      } else out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }

  if ("user" in record && record.user && typeof record.user === "object" && "id" in (record.user as object)) {
    if ("expires_at" in record || "expires_in" in record) {
      return sanitizeSession(record);
    }
    return sanitizeUser(record.user);
  }

  if ("expires_at" in record && "access_token" in record) {
    return sanitizeSession(record);
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      out[key] = "[redacted]";
    } else if (lower === "email" && typeof val === "string") {
      out[key] = redactEmail(val);
    } else if (isProd() && PII_KEYS.has(lower)) {
      out[key] = "[redacted]";
    } else if (
      isProd() &&
      ID_LIKE_KEYS.has(lower) &&
      typeof val === "string" &&
      UUID_PATTERN.test(val.trim())
    ) {
      out[key] = redactUserId(val);
    } else if (
      isProd() &&
      /_url|photo|avatar|displayurl|storedref|publicurl/i.test(key) &&
      typeof val === "string" &&
      val.trim().startsWith("http")
    ) {
      out[key] = truncatePhotoUrl(val.trim());
    } else if (lower === "user_metadata" || lower === "app_metadata") {
      out[key] = "[redacted-metadata]";
    } else if (lower === "identities") {
      out[key] = Array.isArray(val)
        ? (val as Array<{ provider?: string }>).map((id) => ({ provider: id.provider ?? null }))
        : "[redacted]";
    } else if (
      isProd() &&
      (lower === "freshuser" || lower === "profile" || lower === "session") &&
      val &&
      typeof val === "object"
    ) {
      out[key] =
        lower === "session"
          ? sanitizeSession(val)
          : lower === "freshuser" || (val as User).id
            ? sanitizeUser(val)
            : sanitizeValue(val, depth + 1);
    } else {
      out[key] = sanitizeValue(val, depth + 1);
    }
  }
  return out;
}

function wrapConsoleMethod(method: "log" | "info" | "warn" | "error" | "debug"): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    original(...args.map((arg) => sanitizeValue(arg)));
  };
}

let installed = false;

export function installOAuthSafeConsole(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  wrapConsoleMethod("log");
  wrapConsoleMethod("info");
  wrapConsoleMethod("warn");
  wrapConsoleMethod("error");
  wrapConsoleMethod("debug");
}

installOAuthSafeConsole();
