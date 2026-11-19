import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { emptyAccountDeletionUserStorage } from "../_shared/accountDeletionStorageCleanup.ts";
import { processAccountDeletionStorageJobs } from "../_shared/accountDeletionStorageJobs.ts";
import { ACCOUNT_DELETION_STORAGE_BUCKETS } from "../_shared/accountDeletionStorageRetry.ts";
import { authorizeAccountDeletionStoragePurge } from "../_shared/accountDeletionStoragePurgeAuth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DELETION_TABLE = "account_deletion_requests";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  let auth = authorizeAccountDeletionStoragePurge({
    authorizationHeader: req.headers.get("Authorization"),
    apikeyHeader: req.headers.get("apikey"),
    serviceRoleKey,
    anonKey,
  });
  const cronSecret =
  Deno.env.get("ACCOUNT_DELETION_CRON_SECRET")?.trim() ?? "";


if (auth === "unauthorized" && cronSecret) {
  auth = authorizeAccountDeletionStoragePurge({
    apikeyHeader: req.headers.get("x-account-deletion-cron-secret"),
    serviceRoleKey: cronSecret,
  });
}
  if (auth === "server_misconfigured" || !supabaseUrl) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }
  
  if (auth !== "ok") {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await processAccountDeletionStorageJobs({
      nowMs: Date.now(),
      claim: async () => {
        const { data, error } = await admin.rpc("claim_account_deletion_storage_jobs", {
          p_limit: 20,
        });
        if (error) throw new Error(error.message || "claim_failed");
        return (data ?? []).map((row: {
          user_id: string;
          storage_attempts: number;
          storage_removed: number;
          alerted_at: string | null;
        }) => ({
          userId: row.user_id,
          storageAttempts: row.storage_attempts ?? 0,
          storageRemoved: row.storage_removed ?? 0,
          alertedAt: row.alerted_at,
        }));
      },
      emptyPrefix: async (userId) =>
        emptyAccountDeletionUserStorage(
          (bucketName) => {
            const bucket = admin.storage.from(bucketName);
            return {
              list: (prefix, opts) => bucket.list(prefix, opts),
              remove: (paths) => bucket.remove(paths),
            };
          },
          ACCOUNT_DELETION_STORAGE_BUCKETS,
          userId,
          1,
          async () => undefined,
          () => 0,
        ),
      save: async (userId, patch) => {
        const { error } = await admin
          .from(DELETION_TABLE)
          .update({
            ...patch,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        if (error) throw new Error(error.message || "tombstone_update_failed");
      },
      log: {
        info: (event, extra) => console.info(`[purge-deleted-account-storage] ${event}`, extra ?? {}),
        alert: (event, extra) =>
          console.error(`[purge-deleted-account-storage] ALERT ${event}`, extra ?? {}),
      },
      persistAlert: async (event) => {
        const { error } = await admin.rpc("record_account_deletion_ops_event", {
          p_kind: event.kind,
          p_user_key: event.userKey,
          p_attempts: event.attempts,
          p_error_code: event.errorCode,
        });
        if (error) throw new Error(error.message || "ops_event_failed");
      },
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    console.error("[purge-deleted-account-storage] unexpected", error);
    return jsonResponse({ error: "purge_unexpected" }, 500);
  }
});
