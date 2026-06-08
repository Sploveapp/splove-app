/** Crédits « Retour » SPLove+ consommables par Discover (local, par utilisateur). */
export const DISCOVER_UNDO_CREDIT_EVENT = "splove-discover-undo-credit-changed";

export type DiscoverUndoCreditEventDetail = { userId: string; count: number };

const LS_PREFIX = "splove_discover_undo_credits:";

function storageKey(userId: string): string {
  return `${LS_PREFIX}${userId}`;
}

function readCount(userId: string): number {
  if (typeof window === "undefined" || !userId) return 0;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const n = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(userId: string, count: number): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const key = storageKey(userId);
    if (count <= 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(Math.floor(count)));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent<DiscoverUndoCreditEventDetail>(DISCOVER_UNDO_CREDIT_EVENT, {
      detail: { userId, count: Math.max(0, Math.floor(count)) },
    }),
  );
}

export function getDiscoverUndoCreditCount(userId: string | null | undefined): number {
  if (!userId) return 0;
  return readCount(userId);
}

export function hasDiscoverUndoCredit(userId: string | null | undefined): boolean {
  return getDiscoverUndoCreditCount(userId) > 0;
}

/** Active un crédit retour utilisable dans Discover. */
export function activateDiscoverUndoCredit(userId: string, delta = 1): number {
  const next = readCount(userId) + Math.max(1, Math.floor(delta));
  writeCount(userId, next);
  console.log("[SPLove+] retour credit activated", { userId: userId.slice(0, 8), credits: next });
  return next;
}

/** Consomme un crédit retour (après undo serveur sans pile locale). */
export function consumeDiscoverUndoCredit(userId: string): boolean {
  const current = readCount(userId);
  if (current <= 0) return false;
  writeCount(userId, current - 1);
  return true;
}
