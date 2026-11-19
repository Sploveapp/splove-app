/** Copie Deno de src/lib/accountDeletionStorageAlert.ts */

export const ACCOUNT_DELETION_STORAGE_USER_KEY_LEN = 8;

export function accountDeletionStorageUserKey(userId: string): string {
  const trimmed = userId.trim();
  return trimmed.slice(0, ACCOUNT_DELETION_STORAGE_USER_KEY_LEN);
}

export function sanitizeAccountDeletionStorageError(message: string): string {
  let value = message.trim().slice(0, 300);
  value = value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  value = value.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
  value = value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  value = value.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, "[redacted-url]");
  value = value.replace(/service_role[^\s]*/gi, "[redacted-role]");
  return value.length > 0 ? value : "storage_failed";
}

export type AccountDeletionOpsEventKind =
  | "storage_repeated_failure"
  | "storage_stuck";

export type AccountDeletionOpsEvent = {
  kind: AccountDeletionOpsEventKind;
  userKey: string;
  attempts: number;
  errorCode: string;
};

export function buildAccountDeletionOpsEvent(args: {
  kind: AccountDeletionOpsEventKind;
  userId: string;
  attempts: number;
  errorMessage: string;
}): AccountDeletionOpsEvent {
  return {
    kind: args.kind,
    userKey: accountDeletionStorageUserKey(args.userId),
    attempts: args.attempts,
    errorCode: sanitizeAccountDeletionStorageError(args.errorMessage),
  };
}
