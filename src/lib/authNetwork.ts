import type { Session } from "@supabase/supabase-js";

/** Erreurs réseau iOS / CapacitorHttp / WKWebView — retry limité autorisé. */
export function isRetryableNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network|connection was lost|timeout|NSURLError|Load failed|status 0|CapacitorHttp/i.test(
    msg,
  );
}

export function sameAuthUserId(prev: Session | null, next: Session | null): boolean {
  const a = prev?.user?.id ?? null;
  const b = next?.user?.id ?? null;
  return Boolean(a && b && a === b);
}

/** Rafraîchissement token sans changement d’utilisateur — ne pas relancer le bootstrap UI. */
export function isRedundantSessionRefreshEvent(
  event: string,
  prev: Session | null,
  next: Session | null,
): boolean {
  if (event !== "TOKEN_REFRESHED" && event !== "USER_UPDATED") return false;
  return sameAuthUserId(prev, next);
}
