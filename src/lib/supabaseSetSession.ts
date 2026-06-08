import type { AuthError, Session } from "@supabase/supabase-js";
import { redactUserId } from "./oauthLogSanitize";
import { supabase } from "./supabase";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 400;
export const SET_SESSION_TIMEOUT_MS = 8000;
const GET_SESSION_VERIFY_DELAY_MS = 400;

export type OAuthSetSessionOutcome = {
  data: { session: Session | null };
  error: Error | null;
  timedOut: boolean;
};

function isRetryableAuthError(error: AuthError): boolean {
  return error.name === "AuthRetryableFetchError" || (error as { status?: number }).status === 0;
}

function logSetSessionOutcome(
  data: { session: Session | null },
  error: AuthError | null,
  phase: string,
): void {
  const userId = data.session?.user?.id ?? null;
  console.log("[AuthCallback] setSession hasSession", Boolean(userId), { phase });
  console.log("[AuthCallback] setSession userId", redactUserId(userId));
  if (error) {
    console.log("[AuthCallback] setSession error", { phase, message: error.message });
  }
}

async function verifyGetSessionAfterSetSession(): Promise<Session | null> {
  await new Promise((r) => window.setTimeout(r, GET_SESSION_VERIFY_DELAY_MS));
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[AuthCallback] getSession verification hasSession", Boolean(session?.user?.id));
  return session;
}

async function establishOAuthSession(
  accessToken: string,
  refreshToken: string,
): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
  return setSupabaseSessionFromOAuthTokens(accessToken, refreshToken);
}

/**
 * Client Supabase global (`storageKey: splove-auth`) — setSession puis session retournée.
 * getSession de vérification uniquement si setSession n’a pas renvoyé de session.
 */
export async function setSupabaseSessionFromOAuthTokens(
  accessToken: string,
  refreshToken: string,
): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
  let lastError: AuthError | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * attempt;
      console.log("[setSession] retry", attempt + 1, "after", delay, "ms");
      await new Promise((r) => window.setTimeout(r, delay));
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    logSetSessionOutcome(data, error, `attempt_${attempt + 1}`);

    if (!error && data.session?.user?.id) {
      return { data: { session: data.session }, error: null };
    }

    if (error) {
      lastError = error;
      if (!isRetryableAuthError(error)) {
        return { data: { session: null }, error };
      }
    }
  }

  const verified = await verifyGetSessionAfterSetSession();
  if (verified?.user?.id) {
    return { data: { session: verified }, error: null };
  }

  return {
    data: { session: null },
    error: lastError ?? ({ message: "setSession returned no session", name: "AuthError" } as AuthError),
  };
}

/** Race 5s — ne laisse jamais le callback OAuth bloqué sur `auth.setSession()`. */
export async function setOAuthSessionWithTimeout(
  accessToken: string,
  refreshToken: string,
  timeoutMs = SET_SESSION_TIMEOUT_MS,
): Promise<OAuthSetSessionOutcome> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<OAuthSetSessionOutcome>((resolve) => {
    timeoutId = window.setTimeout(
      () =>
        resolve({
          data: { session: null },
          error: new Error("setSession timeout"),
          timedOut: true,
        }),
      timeoutMs,
    );
  });

  const workPromise = (async (): Promise<OAuthSetSessionOutcome> => {
    const { data, error } = await establishOAuthSession(accessToken, refreshToken);
    return {
      data,
      error: error ? new Error(error.message) : null,
      timedOut: false,
    };
  })();

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}
