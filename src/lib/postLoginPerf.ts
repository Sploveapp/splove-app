import { seedPostLoginOptionalColSkips } from "./profileSelect";

const OAUTH_SESSION_MARK_KEY = "splove_oauth_session_at_ms";

let optionalBatchInFlight = 0;

/** Appelé juste après setSession OAuth réussi (AuthCallback). */
export function markOAuthSessionAt(): void {
  try {
    sessionStorage.setItem(OAUTH_SESSION_MARK_KEY, String(Date.now()));
    seedPostLoginOptionalColSkips();
  } catch {
    /* private mode */
  }
}

function oauthSessionMarkMs(): number | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_SESSION_MARK_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function elapsedSinceOAuthMark(): number | null {
  const start = oauthSessionMarkMs();
  if (start == null) return null;
  return Math.max(0, Date.now() - start);
}

function logPostLoginPerfMs(metric: string): void {
  const ms = elapsedSinceOAuthMark();
  if (ms != null) {
    console.log(`[POST_LOGIN_PERF] ${metric}`, ms);
  } else {
    console.log(`[POST_LOGIN_PERF] ${metric}`);
  }
}

/** Navigation AuthCallback → Discover (après setSession). */
export function logOAuthRedirect(): void {
  logPostLoginPerfMs("oauth_redirect_ms");
}

/** Shell Discover visible (hero + skeleton). */
export function logDiscoverShellVisible(forced = false): void {
  logPostLoginPerfMs(forced ? "discover_shell_visible_ms_forced" : "discover_shell_visible_ms");
}

/** @deprecated Alias — préférer logDiscoverShellVisible */
export function logDiscoverShellReady(forced = false): void {
  logDiscoverShellVisible(forced);
}

/** Première carte Discover visible. */
export function logDiscoverFirstCardVisible(): void {
  logPostLoginPerfMs("first_card_visible_ms");
}

/** Feed terminé sans carte (geo, erreur, pile vide). */
export function logDiscoverEmptyStateVisible(): void {
  logPostLoginPerfMs("empty_state_visible_ms");
}

function logDeferredQueriesDone(): void {
  logPostLoginPerfMs("deferred_queries_done_ms");
}

/**
 * Regroupe requêtes optionnelles (notifications, referral, rewind, likes, etc.)
 * après le premier paint Discover.
 */
export async function runPostLoginOptionalBatch(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  optionalBatchInFlight += 1;
  const batchStart = Date.now();
  const sinceOAuth = elapsedSinceOAuthMark();
  console.log("[POST_LOGIN_PERF] deferred optional queries start", { label, sinceOAuthMs: sinceOAuth });
  try {
    await fn();
  } catch (e) {
    console.warn("[POST_LOGIN_PERF] deferred optional queries error", label, e);
  } finally {
    optionalBatchInFlight -= 1;
    const batchMs = Date.now() - batchStart;
    console.log("[POST_LOGIN_PERF] deferred optional queries done", { label, batchMs });
    if (optionalBatchInFlight === 0) {
      logDeferredQueriesDone();
    }
  }
}
