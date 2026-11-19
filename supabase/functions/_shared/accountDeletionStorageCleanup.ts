/**
 * Copie Deno du vidage de préfixe (src/lib/accountDeletionStorageCleanup.ts).
 * Aucune table commerce.
 */

export type StorageListItem = {
  name?: string | null;
  id?: string | null;
};

export type AccountDeletionStorageClient = {
  list: (
    prefix: string,
    opts: { limit: number; offset: number; sortBy: { column: string; order: "asc" } },
  ) => Promise<{ data: StorageListItem[] | null; error: { message?: string } | null }>;
  remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>;
};

export const STORAGE_LIST_PAGE = 100; // keep in sync with tests that fill one page then leftovers
export const STORAGE_MAX_PAGES = 50;
export const STORAGE_MAX_DEPTH = 5;

export const ACCOUNT_DELETION_STORAGE_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export function isAccountDeletionStorageUserId(value: string): boolean {
  return ACCOUNT_DELETION_STORAGE_USER_ID_RE.test(value);
}

/** Échec de wipe : `removed` = suppressions confirmées de cette exécution. `remainingListed` n’est pas une preuve de fin. */
export class AccountDeletionStorageCleanupError extends Error {
  readonly removed: number;
  readonly remainingListed: number | null;

  constructor(
    message: string,
    options: { removed?: number; remainingListed?: number | null } = {},
  ) {
    super(message);
    this.name = "AccountDeletionStorageCleanupError";
    this.removed = Math.max(0, options.removed ?? 0);
    this.remainingListed = options.remainingListed ?? null;
  }
}

export function accountDeletionStorageRemovedFromError(error: unknown): number {
  if (error instanceof AccountDeletionStorageCleanupError) {
    return error.removed;
  }
  return 0;
}

function wrapCleanupError(
  error: unknown,
  removedPrior: number,
  remainingListed: number | null = null,
): AccountDeletionStorageCleanupError {
  const nestedRemaining =
    error instanceof AccountDeletionStorageCleanupError ? error.remainingListed : null;
  const message = error instanceof Error ? error.message : "storage_failed";
  return new AccountDeletionStorageCleanupError(message, {
    removed: removedPrior + accountDeletionStorageRemovedFromError(error),
    remainingListed: remainingListed ?? nestedRemaining,
  });
}

function failPrefixCleanup(message: string, removed: number): never {
  throw new AccountDeletionStorageCleanupError(message, { removed });
}

async function countListedAtUserPrefix(
  fromBucket: (bucket: string) => AccountDeletionStorageClient,
  buckets: readonly string[],
  userId: string,
): Promise<number | null> {
  let total = 0;
  for (const bucket of buckets) {
    const { data, error } = await fromBucket(bucket).list(userId, {
      limit: STORAGE_LIST_PAGE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      return null;
    }
    total += data?.length ?? 0;
  }
  return total;
}

function assertSafeStorageSegment(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    !SAFE_SEGMENT_RE.test(name)
  ) {
    throw new Error("storage_prefix_invalid");
  }
}

export function normalizeAccountDeletionStoragePrefix(prefix: string, depth: number): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  const parts = trimmed.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new Error("storage_prefix_invalid");
  }
  if (depth === 0 && parts.length !== 1) {
    throw new Error("storage_prefix_invalid");
  }
  if (!isAccountDeletionStorageUserId(parts[0])) {
    throw new Error("storage_user_id_invalid");
  }
  for (let i = 1; i < parts.length; i += 1) {
    assertSafeStorageSegment(parts[i]);
  }
  return parts.join("/");
}

export async function emptyAccountDeletionStoragePrefix(
  storage: AccountDeletionStorageClient,
  prefix: string,
  depth = 0,
): Promise<number> {
  if (depth > STORAGE_MAX_DEPTH) {
    throw new Error("storage_prefix_too_deep");
  }

  const trimmed = normalizeAccountDeletionStoragePrefix(prefix, depth);

  let removed = 0;
  for (let page = 0; page < STORAGE_MAX_PAGES; page++) {
    const { data: listed, error: listError } = await storage.list(trimmed, {
      limit: STORAGE_LIST_PAGE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (listError) {
      failPrefixCleanup(listError.message || "storage_list_failed", removed);
    }
    if (!listed?.length) {
      return removed;
    }

    const files: string[] = [];
    const folders: string[] = [];
    for (const item of listed) {
      if (!item.name) continue;
      assertSafeStorageSegment(item.name);
      if (item.id == null) folders.push(item.name);
      else files.push(`${trimmed}/${item.name}`);
    }
    if (files.length === 0 && folders.length === 0) {
      failPrefixCleanup("storage_list_unrecognized", removed);
    }

    if (files.length > 0) {
      const { error: removeError } = await storage.remove(files);
      if (removeError) {
        failPrefixCleanup(removeError.message || "storage_remove_failed", removed);
      }
      removed += files.length;
    }

    for (const folder of folders) {
      try {
        removed += await emptyAccountDeletionStoragePrefix(
          storage,
          `${trimmed}/${folder}`,
          depth + 1,
        );
      } catch (error) {
        failPrefixCleanup(
          error instanceof Error ? error.message : "storage_failed",
          removed + accountDeletionStorageRemovedFromError(error),
        );
      }
    }
  }

  const { data: left, error: leftError } = await storage.list(trimmed, {
    limit: 1,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (leftError) {
    failPrefixCleanup(leftError.message || "storage_list_failed", removed);
  }
  if (left?.length) {
    failPrefixCleanup("storage_prefix_not_empty", removed);
  }
  return removed;
}

export async function emptyAccountDeletionStoragePrefixWithRetries(
  storage: AccountDeletionStorageClient,
  prefix: string,
  attempts: number,
  sleepFn: (ms: number) => Promise<void>,
  backoffMsForAttempt: (attempt: number) => number,
): Promise<number> {
  let lastError: unknown = new Error("storage_failed");
  let removed = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      removed += await emptyAccountDeletionStoragePrefix(storage, prefix);
      return removed;
    } catch (error) {
      lastError = wrapCleanupError(error, removed);
      removed = accountDeletionStorageRemovedFromError(lastError);
      if (attempt < attempts) {
        await sleepFn(backoffMsForAttempt(attempt));
      }
    }
  }
  throw lastError;
}

export async function emptyAccountDeletionUserStorage(
  fromBucket: (bucket: string) => AccountDeletionStorageClient,
  buckets: readonly string[],
  userId: string,
  attempts: number,
  sleepFn: (ms: number) => Promise<void>,
  backoffMsForAttempt: (attempt: number) => number,
): Promise<number> {
  if (!isAccountDeletionStorageUserId(userId)) {
    throw new Error("storage_user_id_invalid");
  }
  let removed = 0;
  let lastError: AccountDeletionStorageCleanupError = new AccountDeletionStorageCleanupError(
    "storage_failed",
    { removed: 0 },
  );
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      for (const bucket of buckets) {
        removed += await emptyAccountDeletionStoragePrefix(fromBucket(bucket), userId);
      }
      const remainingListed = await countListedAtUserPrefix(fromBucket, buckets, userId);
      if (remainingListed === null) {
        throw new Error("storage_list_failed");
      }
      if (remainingListed > 0) {
        throw new Error("storage_prefix_not_empty");
      }
      return removed;
    } catch (error) {
      const remainingListed = await countListedAtUserPrefix(fromBucket, buckets, userId);
      lastError = wrapCleanupError(error, removed, remainingListed);
      removed = lastError.removed;
      if (attempt < attempts) {
        await sleepFn(backoffMsForAttempt(attempt));
      }
    }
  }
  throw lastError;
}
