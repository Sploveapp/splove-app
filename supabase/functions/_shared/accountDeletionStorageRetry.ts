/** Politique de reprise Storage — pas d’I/O, pas d’Apple / Play. */

export const ACCOUNT_DELETION_PHOTO_BUCKET = "profile-photos";
export const ACCOUNT_DELETION_STORAGE_BUCKETS = ["profile-photos", "avatars"] as const;

/** Tentatives dans la requête de suppression (délais courts, timeout Edge). */
export const STORAGE_IN_REQUEST_ATTEMPTS = 3;
export const STORAGE_IN_REQUEST_BACKOFF_MS = [250, 800, 1500] as const;

/** Premier journal ALERT (sans PII). Les suivants : tous les STORAGE_ALERT_EVERY_ATTEMPTS. */
export const STORAGE_ALERT_AFTER_ATTEMPTS = 5;
export const STORAGE_ALERT_EVERY_ATTEMPTS = 5;

const BACKOFF_MS = [15_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

export type AccountDeletionStorageStatus =
  | "pending"
  | "db_deleted"
  | "storage_pending"
  | "failed"
  | "completed";

export type StorageRetryState = {
  status: AccountDeletionStorageStatus;
  storageAttempts: number;
  storageRemoved: number;
  nextRetryAt: string | null;
  alertedAt: string | null;
  lastError: string | null;
};

export function storageBackoffMs(attemptAfterFailure: number): number {
  if (attemptAfterFailure < 1) return BACKOFF_MS[0];
  const i = Math.min(attemptAfterFailure - 1, BACKOFF_MS.length - 1);
  return BACKOFF_MS[i];
}

export function inRequestStorageBackoffMs(attempt: number): number {
  if (attempt < 1) return STORAGE_IN_REQUEST_BACKOFF_MS[0];
  const i = Math.min(attempt - 1, STORAGE_IN_REQUEST_BACKOFF_MS.length - 1);
  return STORAGE_IN_REQUEST_BACKOFF_MS[i];
}

export function nextStorageRetryAt(attemptAfterFailure: number, nowMs: number): string {
  return new Date(nowMs + storageBackoffMs(attemptAfterFailure)).toISOString();
}

export function shouldAlertStorageFailure(args: {
  attemptsAfterThisFailure: number;
  alreadyAlerted: boolean;
}): boolean {
  const { attemptsAfterThisFailure, alreadyAlerted } = args;
  if (attemptsAfterThisFailure < STORAGE_ALERT_AFTER_ATTEMPTS) return false;
  if (!alreadyAlerted) return true;
  return attemptsAfterThisFailure % STORAGE_ALERT_EVERY_ATTEMPTS === 0;
}

export function applyStorageCleanupSuccess(
  previous: Pick<StorageRetryState, "storageRemoved">,
  removedThisRun: number,
): StorageRetryState {
  return {
    status: "completed",
    storageAttempts: 0,
    storageRemoved: previous.storageRemoved + Math.max(0, removedThisRun),
    nextRetryAt: null,
    alertedAt: null,
    lastError: null,
  };
}

export function applyStorageCleanupFailure(
  previous: Pick<StorageRetryState, "storageAttempts" | "storageRemoved" | "alertedAt">,
  errorMessage: string,
  nowMs: number,
  removedThisRun = 0,
): StorageRetryState & { shouldAlert: boolean } {
  const attempts = previous.storageAttempts + 1;
  const shouldAlert = shouldAlertStorageFailure({
    attemptsAfterThisFailure: attempts,
    alreadyAlerted: Boolean(previous.alertedAt),
  });
  const clipped = errorMessage.trim().slice(0, 300);
  return {
    status: "storage_pending",
    storageAttempts: attempts,
    storageRemoved: previous.storageRemoved + Math.max(0, removedThisRun),
    nextRetryAt: nextStorageRetryAt(attempts, nowMs),
    alertedAt: shouldAlert ? new Date(nowMs).toISOString() : previous.alertedAt,
    lastError: clipped.length > 0 ? clipped : "storage_failed",
    shouldAlert,
  };
}

export function isStorageCleanupDue(
  row: Pick<StorageRetryState, "status" | "nextRetryAt">,
  nowMs: number,
): boolean {
  if (row.status !== "db_deleted" && row.status !== "storage_pending") return false;
  if (!row.nextRetryAt) return true;
  const t = Date.parse(row.nextRetryAt);
  if (!Number.isFinite(t)) return true;
  return t <= nowMs;
}
