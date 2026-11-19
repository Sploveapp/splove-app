import {
  applyStorageCleanupFailure,
  applyStorageCleanupSuccess,
  type StorageRetryState,
} from "./accountDeletionStorageRetry.ts";
import { accountDeletionStorageRemovedFromError } from "./accountDeletionStorageCleanup.ts";
import {
  accountDeletionStorageUserKey,
  buildAccountDeletionOpsEvent,
  sanitizeAccountDeletionStorageError,
  type AccountDeletionOpsEvent,
} from "./accountDeletionStorageAlert.ts";

export type StorageJobClaim = {
  userId: string;
  storageAttempts: number;
  storageRemoved: number;
  alertedAt: string | null;
};

export type StorageJobSave = {
  status: StorageRetryState["status"];
  storage_attempts: number;
  storage_removed: number;
  next_retry_at: string | null;
  alerted_at: string | null;
  last_error: string | null;
};

export type StorageJobLogger = {
  info: (event: string, extra?: Record<string, unknown>) => void;
  alert: (event: string, extra?: Record<string, unknown>) => void;
};

/**
 * Reprise Storage hors session utilisateur. N’écrit que le tombstone photos.
 */
export async function processAccountDeletionStorageJobs(deps: {
  nowMs: number;
  claim: () => Promise<StorageJobClaim[]>;
  emptyPrefix: (userId: string) => Promise<number>;
  save: (userId: string, patch: StorageJobSave) => Promise<void>;
  log: StorageJobLogger;
  persistAlert?: (event: AccountDeletionOpsEvent) => Promise<void>;
}): Promise<{ completed: number; failed: number; alerted: number }> {
  const jobs = await deps.claim();
  let completed = 0;
  let failed = 0;
  let alerted = 0;

  for (const job of jobs) {
    const userKey = accountDeletionStorageUserKey(job.userId);
    try {
      const removed = await deps.emptyPrefix(job.userId);
      const next = applyStorageCleanupSuccess(
        { storageRemoved: job.storageRemoved },
        removed,
      );
      await deps.save(job.userId, toSave(next));
      completed += 1;
      deps.log.info("account_deletion_storage_completed", {
        userKey,
        removed,
      });
    } catch (error) {
      const message = sanitizeAccountDeletionStorageError(
        error instanceof Error ? error.message : "storage_failed",
      );
      const next = applyStorageCleanupFailure(
        {
          storageAttempts: job.storageAttempts,
          storageRemoved: job.storageRemoved,
          alertedAt: job.alertedAt,
        },
        message,
        deps.nowMs,
        accountDeletionStorageRemovedFromError(error),
      );
      await deps.save(job.userId, toSave(next));
      failed += 1;
      deps.log.info("account_deletion_storage_retry_scheduled", {
        userKey,
        attempts: next.storageAttempts,
      });
      if (next.shouldAlert) {
        alerted += 1;
        const event = buildAccountDeletionOpsEvent({
          kind: "storage_repeated_failure",
          userId: job.userId,
          attempts: next.storageAttempts,
          errorMessage: next.lastError ?? message,
        });
        deps.log.alert("account_deletion_storage_repeated_failure", {
          userKey: event.userKey,
          attempts: event.attempts,
          error: event.errorCode,
        });
        if (deps.persistAlert) {
          await deps.persistAlert(event).catch(() => undefined);
        }
      }
    }
  }

  return { completed, failed, alerted };
}

function toSave(state: StorageRetryState): StorageJobSave {
  return {
    status: state.status,
    storage_attempts: state.storageAttempts,
    storage_removed: state.storageRemoved,
    next_retry_at: state.nextRetryAt,
    alerted_at: state.alertedAt,
    last_error: state.lastError,
  };
}
