import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  accountDeletionStorageRemovedFromError,
  emptyAccountDeletionUserStorage,
} from "../_shared/accountDeletionStorageCleanup.ts";
import {
  ACCOUNT_DELETION_STORAGE_BUCKETS,
  STORAGE_IN_REQUEST_ATTEMPTS,
  applyStorageCleanupFailure,
  inRequestStorageBackoffMs,
} from "../_shared/accountDeletionStorageRetry.ts";
import { kickAccountDeletionStoragePurge } from "../_shared/accountDeletionStoragePurgeKick.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DELETION_TABLE = "account_deletion_requests";

type Body = {
  confirmPhrase?: string;
};

type CleanupStep = {
  step: string;
  ok: boolean;
  deleted?: number;
};

type AdminClient = SupabaseClient;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertDeletionRequest(
  admin: AdminClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from(DELETION_TABLE).upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(error.message || "deletion_request_write_failed");
  }
}

async function kickStoragePurge(supabaseUrl: string, serviceRoleKey: string): Promise<void> {
  await kickAccountDeletionStoragePurge({
    supabaseUrl,
    serviceRoleKey,
    log: {
      info: (event, extra) => console.info(`[delete-my-account] ${event}`, extra ?? {}),
      error: (event, extra) => console.error(`[delete-my-account] ${event}`, extra ?? {}),
    },
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

  const steps: CleanupStep[] = [];

  try {
    try {
      await upsertDeletionRequest(admin, userId, { status: "pending", last_error: null });
    } catch (tombstoneError) {
      console.error("[delete-my-account] tombstone failed", tombstoneError);
      steps.push({ step: "deletion_request", ok: false });
      return jsonResponse({ error: "delete_request_failed", steps }, 500);
    }
    steps.push({ step: "deletion_request", ok: true });

    const { data: commitData, error: commitError } = await admin.rpc("commit_account_deletion", {
      p_user_id: userId,
    });
    if (commitError) {
      console.error("[delete-my-account] commit_account_deletion failed", commitError.message);
      await upsertDeletionRequest(admin, userId, {
        status: "failed",
        last_error: commitError.message.slice(0, 300),
      }).catch(() => undefined);
      steps.push({ step: "auth_user", ok: false });
      return jsonResponse({ error: "delete_auth_user_failed", steps }, 500);
    }
    steps.push({ step: "auth_user", ok: true });

    try {
      const removedFiles = await emptyAccountDeletionUserStorage(
        (bucketName) => {
          const bucket = admin.storage.from(bucketName);
          return {
            list: (prefix, opts) => bucket.list(prefix, opts),
            remove: (paths) => bucket.remove(paths),
          };
        },
        ACCOUNT_DELETION_STORAGE_BUCKETS,
        userId,
        STORAGE_IN_REQUEST_ATTEMPTS,
        sleepMs,
        inRequestStorageBackoffMs,
      );
      await upsertDeletionRequest(admin, userId, {
        status: "completed",
        storage_removed: removedFiles,
        storage_attempts: 0,
        next_retry_at: null,
        alerted_at: null,
        last_error: null,
      });
      steps.push({ step: "storage_profile_photos", ok: true, deleted: removedFiles });
      console.info("[delete-my-account] completed", {
        userId: userId.slice(0, 8),
        alreadyCompleted: Boolean(
          commitData && typeof commitData === "object" && "already_completed" in commitData
            ? (commitData as { already_completed?: boolean }).already_completed
            : false,
        ),
        storageFilesRemoved: removedFiles,
      });
      return jsonResponse({ ok: true, authDeleted: true, steps });
    } catch (storageError) {
      const message = storageError instanceof Error ? storageError.message : "storage_failed";
      const next = applyStorageCleanupFailure(
        { storageAttempts: 0, storageRemoved: 0, alertedAt: null },
        message,
        Date.now(),
        accountDeletionStorageRemovedFromError(storageError),
      );
      console.error("[delete-my-account] storage cleanup failed after auth delete", {
        userKey: userId.slice(0, 8),
        attempts: next.storageAttempts,
        error: next.lastError,
      });
      await upsertDeletionRequest(admin, userId, {
        status: next.status,
        storage_removed: next.storageRemoved,
        storage_attempts: next.storageAttempts,
        next_retry_at: next.nextRetryAt,
        alerted_at: next.alertedAt,
        last_error: next.lastError,
      }).catch(() => undefined);
      steps.push({ step: "storage_profile_photos", ok: false });
      await kickStoragePurge(supabaseUrl, serviceRoleKey);
      return jsonResponse({
        ok: true,
        authDeleted: true,
        storagePending: true,
        steps,
      });
    }
  } catch (e) {
    console.error("[delete-my-account] unexpected", e);
    return jsonResponse({ error: "delete_unexpected", steps }, 500);
  }
});
