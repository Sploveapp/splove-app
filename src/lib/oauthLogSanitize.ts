import type { AuthError, Session } from "@supabase/supabase-js";

const SENSITIVE_PARAM =
  /(^|&)(access_token|refresh_token|provider_token|provider_refresh_token|code|token)=/i;

/** Redact OAuth tokens from URLs before logging. */
export function redactOAuthUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "(empty)";
  const raw = url.trim();
  if (SENSITIVE_PARAM.test(raw) || /[#?].*(access_token|refresh_token|provider_token)/i.test(raw)) {
    const base = raw.split("?")[0]?.split("#")[0] ?? raw;
    return `${base}[redacted]`;
  }
  try {
    const parsed = new URL(raw, "https://local.invalid");
    return `${parsed.protocol}//${parsed.host}${parsed.pathname || ""}`;
  } catch {
    return raw.split("?")[0]?.split("#")[0] || "[invalid-url]";
  }
}

export function redactUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

export function logOAuthLocationSummary(parts: {
  href?: string;
  hash?: string;
  search?: string;
  routerSearch?: string;
  routerHash?: string;
}): Record<string, unknown> {
  return {
    href: redactOAuthUrl(parts.href),
    hash: parts.hash ? redactOAuthUrl(`https://local.invalid${parts.hash}`) : null,
    search: parts.search ? "[present]" : null,
    routerSearch: parts.routerSearch ? "[present]" : null,
    routerHash: parts.routerHash ? redactOAuthUrl(`https://local.invalid${parts.routerHash}`) : null,
  };
}

export function formatSetSessionLog(
  data: { session?: Session | null } | null | undefined,
  error: AuthError | null | undefined,
): { hasSession: boolean; userId: string | null; errorMessage: string | null } {
  return {
    hasSession: Boolean(data?.session?.user?.id),
    userId: redactUserId(data?.session?.user?.id),
    errorMessage: error?.message ?? null,
  };
}

function oauthProviderFromSession(session: Session | null): string | null {
  const user = session?.user;
  if (!user) return null;
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  if (typeof meta?.provider === "string") return meta.provider;
  const identities = user.identities as Array<{ provider?: string }> | undefined;
  return identities?.[0]?.provider ?? null;
}

export function formatFinalSessionLog(result: {
  data: { session: Session | null };
  error: AuthError | null;
}): {
  hasSession: boolean;
  userId: string | null;
  provider: string | null;
  errorMessage: string | null;
} {
  const session = result.data.session;
  return {
    hasSession: Boolean(session?.user?.id),
    userId: redactUserId(session?.user?.id),
    provider: oauthProviderFromSession(session),
    errorMessage: result.error?.message ?? null,
  };
}

export function formatAuthStateChangeLog(
  event: string,
  session: Session | null,
): { event: string; hasSession: boolean; userId: string | null } {
  return {
    event,
    hasSession: Boolean(session?.user?.id),
    userId: redactUserId(session?.user?.id),
  };
}

export function formatExchangeCodeLog(result: {
  data?: { session?: Session | null } | null;
  error?: AuthError | null;
}): { hasSession: boolean; userId: string | null; errorMessage: string | null } {
  return {
    hasSession: Boolean(result.data?.session?.user?.id),
    userId: redactUserId(result.data?.session?.user?.id),
    errorMessage: result.error?.message ?? null,
  };
}
