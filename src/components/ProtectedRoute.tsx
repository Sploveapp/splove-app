import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: React.ReactNode;
};

/** Session + profil « terminé » (`isProfileComplete` depuis AuthContext, chargement inclus). */
export function ProtectedRoute({ children }: Props) {
  const { session, isLoading, isAuthInitialized, isProfileLoading, profile, isProfileComplete } =
    useAuth();
  const location = useLocation();
  const pathname = location.pathname || "/";
  const isOnboardingPath = pathname === "/onboarding";
  const isMainFeaturePath =
    pathname === "/discover" ||
    pathname === "/likes-you" ||
    pathname === "/messages" ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/chat/");
  const authUserId = session?.user?.id ?? null;
  const profileFetchResult = profile ? "ok" : "null";

  if (import.meta.env.DEV) {
    const pr = profile as Record<string, unknown> | null | undefined;
    console.info("[ProtectedRoute diagnostics] decision_input", {
      current_route: pathname,
      auth_user_id: authUserId,
      profile_fetch_result: profileFetchResult,
      profile_completed: profile?.profile_completed ?? null,
      onboarding_completed: pr?.onboarding_completed ?? null,
      onboarding_done: pr?.onboarding_done ?? null,
      is_profile_complete: isProfileComplete,
      is_auth_initialized: isAuthInitialized,
      is_loading: isLoading,
      is_profile_loading: isProfileLoading,
    });
  }

  if (!isAuthInitialized || isLoading) {
    if (import.meta.env.DEV) {
      const pr = profile as Record<string, unknown> | null | undefined;
      console.info("[ProtectedRoute diagnostics] redirect_decision", {
        current_route: pathname,
        auth_user_id: authUserId,
        profile_fetch_result: profileFetchResult,
        profile_completed: profile?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
        redirect_reason: "show_splash_auth_bootstrap",
      });
    }
    return <SplashScreen />;
  }

  if (!session) {
    console.log("[ONBOARDING_GUARD] no-session -> /", { pathname });
    if (import.meta.env.DEV) {
      const pr = profile as Record<string, unknown> | null | undefined;
      console.info("[ProtectedRoute diagnostics] redirect_decision", {
        current_route: pathname,
        auth_user_id: authUserId,
        profile_fetch_result: profileFetchResult,
        profile_completed: profile?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
        redirect_reason: "navigate_auth",
      });
    }
    return <Navigate to="/" replace />;
  }

  if (isProfileLoading) {
    console.log("[ONBOARDING_GUARD] profile-loading", { pathname });
    if (import.meta.env.DEV) {
      const pr = profile as Record<string, unknown> | null | undefined;
      console.info("[ProtectedRoute diagnostics] redirect_decision", {
        current_route: pathname,
        auth_user_id: authUserId,
        profile_fetch_result: profileFetchResult,
        profile_completed: profile?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
        redirect_reason: "show_splash_profile_loading",
      });
    }
    return <SplashScreen />;
  }

  // Stable failure state: avoid /onboarding redirect loops when profile fetch returns null.
  if (!profile && !isOnboardingPath) {
    if (import.meta.env.DEV) {
      console.info("[ProtectedRoute diagnostics] redirect_decision", {
        current_route: pathname,
        auth_user_id: authUserId,
        profile_fetch_result: profileFetchResult,
        profile_completed: null,
        onboarding_completed: null,
        onboarding_done: null,
        redirect_reason: "show_profile_fetch_error_state",
      });
    }
    return (
      <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16 text-app-text">
        <h1 className="text-lg font-semibold">Profil indisponible</h1>
        <p className="mt-3 text-sm text-app-muted">
          Impossible de charger ton profil pour le moment. Verifie ta connexion puis reessaie.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-app-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Reessayer
        </button>
      </main>
    );
  }

  if (!isProfileComplete && !isOnboardingPath) {
    console.log("[ONBOARDING_GUARD] profile_incomplete -> /onboarding", {
      pathname,
      profile_completed: profile?.profile_completed ?? null,
      is_profile_complete: isProfileComplete,
      blocked_scope: isMainFeaturePath ? "main_features" : "protected_area",
    });
    if (import.meta.env.DEV) {
      const pr = profile as Record<string, unknown> | null | undefined;
      console.info("[ProtectedRoute diagnostics] redirect_decision", {
        current_route: pathname,
        auth_user_id: authUserId,
        profile_fetch_result: profileFetchResult,
        profile_completed: profile?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
        is_profile_complete: isProfileComplete,
        redirect_reason: "navigate_onboarding_profile_incomplete",
      });
    }
    return <Navigate to="/onboarding" replace />;
  }

  if (isMainFeaturePath) {
    console.log("[ONBOARDING_GUARD] access_granted", {
      pathname,
      profile_completed: profile?.profile_completed === true,
      is_profile_complete: isProfileComplete,
    });
  }
  if (import.meta.env.DEV) {
    const pr = profile as Record<string, unknown> | null | undefined;
    console.info("[ProtectedRoute diagnostics] redirect_decision", {
      current_route: pathname,
      auth_user_id: authUserId,
      profile_fetch_result: profileFetchResult,
      profile_completed: profile?.profile_completed ?? null,
      onboarding_completed: pr?.onboarding_completed ?? null,
      onboarding_done: pr?.onboarding_done ?? null,
      is_profile_complete: isProfileComplete,
      redirect_reason: "allow_route",
    });
  }

  return <>{children}</>;
}
