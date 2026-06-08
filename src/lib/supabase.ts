import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseEnv } from "./env";
import { isNativeCapacitorApp } from "./authRedirect";
import { logSupabaseEnvDiagnostic } from "./supabaseDiagnostics";
import { capacitorFetch } from "./supabaseCapacitorFetch";
import {
  createCapacitorAuthStorage,
  logAuthStorageState,
} from "./supabaseCapacitorStorage";

const fallbackUrl = "https://missing-supabase-url.local";
const fallbackAnonKey = "missing-supabase-anon-key";

if (!hasSupabaseEnv) {
  console.error(
    "[SPLove env] Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). " +
      "Créez un fichier .env à la racine avant `npm run build` / `npx cap sync ios`.",
  );
}

const supabaseUrl = env.supabaseUrl ?? fallbackUrl;
const supabaseAnonKey = env.supabaseAnonKey ?? fallbackAnonKey;

const isNativeCapacitor =
  typeof window !== "undefined" && isNativeCapacitorApp();

const useCapacitorFetch = isNativeCapacitor;
const authStorageKey = "splove-auth";
const authStorage = isNativeCapacitor ? createCapacitorAuthStorage() : undefined;

if (typeof window !== "undefined") {
  logSupabaseEnvDiagnostic("[Supabase] init");
  if (useCapacitorFetch) {
    console.log("[Supabase] using CapacitorHttp fetch override");
    void logAuthStorageState(authStorageKey);
  }
}

/**
 * Client Supabase unique pour toute l’app React (ne pas appeler createClient ailleurs).
 * CapacitorHttp via `capacitorFetch` sur iOS/Android uniquement.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: useCapacitorFetch ? { fetch: capacitorFetch } : undefined,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    debug: false,
    storageKey: authStorageKey,
    storage: authStorage,
    /** PKCE + deep link natif — évite implicit grant et redirect localhost WKWebView. */
    flowType: "pkce",
    /** Hash/deep-link OAuth géré dans AuthCallback — évite une 2e lecture d’URL côté client. */
    detectSessionInUrl: !isNativeCapacitor,
  },
});

/**
 * Table Postgres des messages de chat (match / conversation).
 * Aligné sur le schéma Supabase live (`messages` + `conversation_id`).
 * Ancien nom local des migrations : conversation_messages.
 */
export const CHAT_MESSAGES_TABLE = "messages";

export function logSupabaseTableError(
  table: string,
  operation: "select" | "insert" | "update" | "delete",
  error: { message?: string; details?: string; hint?: string; code?: string } | null,
): void {
  console.error("[SPLove Supabase]", { table, operation, message: error?.message ?? null, code: error?.code ?? null });
}
