import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { redactUserId } from "./oauthLogSanitize";
import { releaseOAuthLoadingScreenOnSessionVerified } from "./oauthLoadingScreenRelease";

export type OAuthSessionVerifyResult = {
  ok: boolean;
  userId: string | null;
  reason: string;
  getSessionUserId: string | null;
  getUserUserId: string | null;
};

function logPayload(context: string, event: string, payload: Record<string, unknown>): void {
  console.log(`[OAuthRecovery/${context}] ${event}`, payload);
}

/** OAuth exchange / setSession terminé avec succès côté client. */
export function logOAuthSuccess(
  context: string,
  details: Record<string, unknown> = {},
): void {
  logPayload(context, "OAUTH_SUCCESS", details);
}

/** Résultat getSession après OAuth. */
export function logOAuthSessionReceived(
  context: string,
  session: Session | null | undefined,
  error: AuthError | null | undefined,
): void {
  const payload = {
    hasSession: Boolean(session?.user?.id),
    userId: redactUserId(session?.user?.id),
    expiresAt: session?.expires_at ?? null,
    errorMessage: error?.message ?? null,
  };
  console.log("SESSION_RECEIVED", { context, ...payload });
  logPayload(context, "SESSION_RECEIVED", payload);
}

/** Résultat getUser après OAuth (vérif serveur). */
export function logOAuthUserReceived(
  context: string,
  user: User | null | undefined,
  error: AuthError | null | undefined,
): void {
  const payload = {
    hasUser: Boolean(user?.id),
    userId: redactUserId(user?.id),
    errorMessage: error?.message ?? null,
  };
  console.log("USER_RECEIVED", { context, ...payload });
  logPayload(context, "USER_RECEIVED", payload);
}

/** Destination de navigation post-OAuth (ou blocage). */
export function logOAuthRedirectDestination(
  context: string,
  destination: string,
  details: Record<string, unknown> = {},
): void {
  logPayload(context, "REDIRECT_DESTINATION", {
    destination,
    ...details,
  });
}

/**
 * Confirme que la session Supabase est chargée (getSession + getUser alignés).
 * Aucune navigation /onboarding ou /move ne doit précéder ok=true.
 */
export async function verifyDefinitiveSupabaseSession(
  context: string,
): Promise<OAuthSessionVerifyResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  logOAuthSessionReceived(context, session, sessionError);
  const getSessionUserId = session?.user?.id ?? null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  logOAuthUserReceived(context, user, userError);
  const getUserUserId = user?.id ?? null;

  if (sessionError) {
    return {
      ok: false,
      userId: null,
      reason: `getSession_error:${sessionError.message}`,
      getSessionUserId,
      getUserUserId,
    };
  }
  if (!getSessionUserId) {
    return {
      ok: false,
      userId: null,
      reason: "getSession_empty",
      getSessionUserId,
      getUserUserId,
    };
  }
  if (userError) {
    return {
      ok: false,
      userId: null,
      reason: `getUser_error:${userError.message}`,
      getSessionUserId,
      getUserUserId,
    };
  }
  if (!getUserUserId) {
    return {
      ok: false,
      userId: null,
      reason: "getUser_empty",
      getSessionUserId,
      getUserUserId,
    };
  }
  if (getSessionUserId !== getUserUserId) {
    return {
      ok: false,
      userId: null,
      reason: "session_user_mismatch",
      getSessionUserId,
      getUserUserId,
    };
  }

  const verified = {
    ok: true as const,
    userId: getSessionUserId,
    reason: "session_verified",
    getSessionUserId,
    getUserUserId,
  };
  releaseOAuthLoadingScreenOnSessionVerified(context);
  return verified;
}

/** Bloque /onboarding et /move tant que la session n’est pas vérifiée. */
export function shouldDeferOAuthRedirectUntilSessionLoaded(
  destination: string,
  verify: OAuthSessionVerifyResult,
): boolean {
  const needsSession = destination === "/onboarding" || destination === "/move";
  return needsSession && !verify.ok;
}
