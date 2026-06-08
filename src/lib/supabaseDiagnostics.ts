import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { env, hasSupabaseEnv } from "./env";
import { isNativeCapacitorApp, oauthRedirectUrl } from "./authRedirect";

export type SupabaseEnvDiagnostic = {
  supabaseUrl: string | null;
  supabaseUrlHost: string | null;
  isHttpsUrl: boolean;
  isInvalidFallbackUrl: boolean;
  platform: string;
  isNative: boolean;
  hasAnonKey: boolean;
  anonKeyPrefix: string | null;
  hasSupabaseEnv: boolean;
  redirectUrl: string;
  webViewOrigin: string | null;
};

function maskSupabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return "(invalid url)";
  }
}

export function getSupabaseEnvDiagnostic(): SupabaseEnvDiagnostic {
  const rawUrl = env.supabaseUrl?.trim() ?? "";
  let host: string | null = null;
  let isHttps = false;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      host = u.hostname;
      isHttps = u.protocol === "https:";
    } catch {
      host = null;
    }
  }

  const anon = env.supabaseAnonKey?.trim() ?? "";

  return {
    supabaseUrl: rawUrl ? maskSupabaseUrl(rawUrl) : null,
    supabaseUrlHost: host,
    isHttpsUrl: isHttps,
    isInvalidFallbackUrl: /missing-supabase-url\.local/i.test(rawUrl),
    platform: Capacitor.getPlatform(),
    isNative: typeof window !== "undefined" && isNativeCapacitorApp(),
    hasAnonKey: anon.length > 20,
    anonKeyPrefix: anon ? `${anon.slice(0, 8)}…` : null,
    hasSupabaseEnv,
    redirectUrl: typeof window !== "undefined" ? oauthRedirectUrl() : "n/a",
    webViewOrigin: typeof window !== "undefined" ? window.location.origin : null,
  };
}

export function logSupabaseEnvDiagnostic(context = "[Supabase]"): void {
  console.log(`${context} env`, getSupabaseEnvDiagnostic());
}

export type SupabaseProbeResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  endpoint: string;
  error: string | null;
};

async function probeEndpoint(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<SupabaseProbeResult> {
  const base = env.supabaseUrl?.trim().replace(/\/+$/, "");
  const anon = env.supabaseAnonKey?.trim();
  if (!base || !anon) {
    return {
      ok: false,
      status: null,
      latencyMs: 0,
      endpoint: path,
      error: "VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY absent au build",
    };
  }

  const url = `${base}${path}`;
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    ...extraHeaders,
  };
  const start = Date.now();

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.get({ url, headers });
      const status = res.status ?? 0;
      return {
        ok: status >= 200 && status < 300,
        status,
        latencyMs: Date.now() - start,
        endpoint: path,
        error: status >= 200 && status < 300 ? null : `HTTP ${status}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        status: 0,
        latencyMs: Date.now() - start,
        endpoint: path,
        error: `CapacitorHttp: ${msg}`,
      };
    }
  }

  try {
    const res = await fetch(url, { method: "GET", headers });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - start,
      endpoint: path,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      endpoint: path,
      error: msg,
    };
  }
}

/** Vérifie que le WebView iOS peut joindre l’API Auth Supabase. */
export async function probeSupabaseAuthHealth(): Promise<SupabaseProbeResult> {
  return probeEndpoint("/auth/v1/health");
}

/** Vérifie que REST Supabase répond (même origine réseau que setSession). */
export async function probeSupabaseRest(): Promise<SupabaseProbeResult> {
  return probeEndpoint("/rest/v1/", { Accept: "application/json" });
}

export async function probeSupabaseReachability(): Promise<{
  auth: SupabaseProbeResult;
  rest: SupabaseProbeResult;
}> {
  const auth = await probeSupabaseAuthHealth();
  const rest = await probeSupabaseRest();
  return { auth, rest };
}
