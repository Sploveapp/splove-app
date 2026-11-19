/**
 * Copie Deno de src/lib/accountDeletionStoragePurgeKick.ts
 */

export const ACCOUNT_DELETION_STORAGE_PURGE_PATH =
  "/functions/v1/purge-deleted-account-storage";
export const ACCOUNT_DELETION_STORAGE_PURGE_KICK_ABORT_MS = 2500;
export const ACCOUNT_DELETION_STORAGE_PURGE_KICK_ATTEMPTS = 2;

export type AccountDeletionStoragePurgeKickLog = {
  info: (event: string, extra?: Record<string, unknown>) => void;
  error: (event: string, extra?: Record<string, unknown>) => void;
};

export type AccountDeletionStoragePurgeKickResult = {
  ok: boolean;
  attempts: number;
  status: number | null;
};

function purgeKickUrl(supabaseUrl: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}${ACCOUNT_DELETION_STORAGE_PURGE_PATH}`;
}

export async function kickAccountDeletionStoragePurge(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  abortMs?: number;
  attempts?: number;
  log?: AccountDeletionStoragePurgeKickLog;
}): Promise<AccountDeletionStoragePurgeKickResult> {
  const key = input.serviceRoleKey.trim();
  const fetchImpl = input.fetchImpl ?? fetch;
  const abortMs = input.abortMs ?? ACCOUNT_DELETION_STORAGE_PURGE_KICK_ABORT_MS;
  const maxAttempts = input.attempts ?? ACCOUNT_DELETION_STORAGE_PURGE_KICK_ATTEMPTS;
  const url = purgeKickUrl(input.supabaseUrl);
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), abortMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: ac.signal,
      });
      lastStatus = response.status;
      if (response.ok) {
        input.log?.info("storage_purge_kick_ok", { attempt, status: response.status });
        return { ok: true, attempts: attempt, status: response.status };
      }
      input.log?.error("storage_purge_kick_failed", { attempt, status: response.status });
    } catch {
      lastStatus = null;
      input.log?.error("storage_purge_kick_failed", { attempt, status: null });
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, attempts: maxAttempts, status: lastStatus };
}
