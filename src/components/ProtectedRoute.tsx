import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: React.ReactNode;
};

/** Session + `profiles.profile_completed === true` (chargement profil inclus). */
export function ProtectedRoute({ children }: Props) {
  const { session, isLoading, isAuthInitialized, isProfileLoading, profile } = useAuth();
  const location = useLocation();
  const pathname = location.pathname || "/";
  const isOnboardingPath = pathname === "/onboarding";
  const isMainFeaturePath =
    pathname === "/discover" ||
    pathname === "/likes-you" ||
    pathname === "/messages" ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/chat/");

  if (!isAuthInitialized || isLoading) {
    return <SplashScreen />;
  }

  if (!session) {
    console.log("[ONBOARDING_GUARD] no-session -> /auth", { pathname });
    return <Navigate to="/auth" replace />;
  }

  if (isProfileLoading) {
    console.log("[ONBOARDING_GUARD] profile-loading", { pathname });
    return <SplashScreen />;
  }

  if (profile?.profile_completed !== true && !isOnboardingPath) {
    console.log("[ONBOARDING_GUARD] profile_incomplete -> /onboarding", {
      pathname,
      profile_completed: profile?.profile_completed ?? null,
      blocked_scope: isMainFeaturePath ? "main_features" : "protected_area",
    });
    return <Navigate to="/onboarding" replace />;
  }

  if (isMainFeaturePath) {
    console.log("[ONBOARDING_GUARD] access_granted", {
      pathname,
      profile_completed: profile?.profile_completed === true,
    });
  }

  return <>{children}</>;
}
