import { isOauthProcessingLocked } from "./oauthCallbackLock";
import { isPostOAuthSplashActive, isPostOAuthSplashRequested } from "./postOAuthSplash";
import { forceReleaseOAuthUx } from "./oauthUxRelease";
import { isProfileCompleteForMove } from "./profileBootCompletion";
import { isNativeCapacitorApp } from "./authRedirect";
import { scrubOAuthTokensFromNativeWindow } from "./scrubOAuthUrlFromWindow";

export type PostOAuthHashRoute = "/move" | "/onboarding";

/** OAuth UX encore actif après login (verrou session ou splash post-Google). */
export function isOAuthUxBlockingAfterProfileReady(): boolean {
  return (
    isOauthProcessingLocked() ||
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive()
  );
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
export function tryExitOAuthLoadingAfterProfileReady(
  profile: Record<string, unknown> | null | undefined,
  sessionUserId: string | null | undefined,
): boolean {
  if (!sessionUserId?.trim() || !profile?.id || profile.id !== sessionUserId) {
    return false;
  }
  if (!isOAuthUxBlockingAfterProfileReady()) {
    return false;
  }
  if (profileReadyExitInFlight) {
    return false;
  }

  const route = resolvePostOAuthHashRouteFromProfile(profile);
  if (!route) {
    return false;
  }

  profileReadyExitInFlight = true;
  try {
    console.log("OAUTH_PROFILE_READY_EXIT", {
      route,
      userId: sessionUserId.slice(0, 8),
    });
    forceReleaseOAuthUx("auth_profile_ready");
    navigatePostOAuthHashRoute(route);
    return true;
  } finally {
    profileReadyExitInFlight = false;
  }
}
