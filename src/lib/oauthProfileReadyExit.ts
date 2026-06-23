import { shouldFinalizePostAuthUi } from "./oauthUxOverlay";
import { forceReleaseOAuthUx } from "./oauthUxRelease";
import { isProfileCompleteForMove } from "./profileBootCompletion";
import { isNativeCapacitorApp } from "./authRedirect";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";
import {
  logOAuthRedirectDestination,
  shouldDeferOAuthRedirectUntilSessionLoaded,
  verifyDefinitiveSupabaseSession,
} from "./oauthSessionRecoveryDiag";

export type PostOAuthHashRoute = "/move" | "/onboarding";

/** OAuth UX encore actif après login (verrou session, splash ou overlay impératif). */
export function isOAuthUxBlockingAfterProfileReady(): boolean {
  return shouldFinalizePostAuthUi();
}

function shouldRunPostAuthProfileExit(
  route: PostOAuthHashRoute | null,
): boolean {
  if (!route) return false;
  if (isOAuthUxBlockingAfterProfileReady()) return true;
  if (route !== "/move" || typeof window === "undefined") return false;
  return window.location.hash.startsWith("#/move");
}

/** Move si onboarding terminé, sinon Onboarding — à partir du profil déjà chargé. */
export function resolvePostOAuthHashRouteFromProfile(
  profile: Record<string, unknown> | null | undefined,
): PostOAuthHashRoute | null {
  if (!profile?.id) return null;
  if (isProfileCompleteForMove(profile)) return "/move";
  return "/onboarding";
}

export function navigatePostOAuthHashRoute(path: PostOAuthHashRoute): void {
  if (typeof window === "undefined") return;

  const hashTarget = `#${path}`;
  scrubOAuthTokensFromNativeWindow();

  if (isNativeCapacitorApp()) {
    const origin = window.location.origin || "https://localhost";
    try {
      window.history.replaceState(null, "", `${origin}/${hashTarget}`);
    } catch {
      /* WKWebView */
    }
  }

  if (window.location.hash !== hashTarget) {
    window.location.hash = hashTarget;
  }
}

let profileReadyExitInFlight = false;

/** Test helper */
export function resetOAuthProfileReadyExitForTests(): void {
  profileReadyExitInFlight = false;
}

/**
 * Après AUTH_PROFILE_READY : libère oauthUx / verrous et route vers Move ou Onboarding.
 * No-op si pas de session, profil non lié, ou OAuth UX déjà inactif.
 */
export async function tryExitOAuthLoadingAfterProfileReady(
  profile: Record<string, unknown> | null | undefined,
  sessionUserId: string | null | undefined,
): Promise<boolean> {
  if (!sessionUserId?.trim() || !profile?.id || profile.id !== sessionUserId) {
    return false;
  }
  const route = resolvePostOAuthHashRouteFromProfile(profile);
  if (!shouldRunPostAuthProfileExit(route)) {
    return false;
  }
  if (profileReadyExitInFlight) {
    return false;
  }

  if (!route) {
    return false;
  }

  profileReadyExitInFlight = true;
  try {
    const sessionVerify = await verifyDefinitiveSupabaseSession("profile_ready_exit");
    if (shouldDeferOAuthRedirectUntilSessionLoaded(route, sessionVerify)) {
      logOAuthRedirectDestination("profile_ready_exit", route, {
        blocked: true,
        reason: sessionVerify.reason,
      });
      return false;
    }

    console.log("OAUTH_PROFILE_READY_EXIT", {
      route,
      userId: sessionUserId.slice(0, 8),
      sessionVerified: sessionVerify.ok,
    });
    logOAuthRedirectDestination("profile_ready_exit", route, {
      blocked: false,
      sessionVerified: true,
    });
    forceReleaseOAuthUx(
      route === "/move" ? "auth_redirect_move" : "auth_profile_ready",
      route,
    );
    navigatePostOAuthHashRoute(route);
    return true;
  } finally {
    profileReadyExitInFlight = false;
  }
}
