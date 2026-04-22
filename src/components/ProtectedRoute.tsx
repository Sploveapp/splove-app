import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: React.ReactNode;
};

/**
 * Protège les routes qui nécessitent une session ET un profil complet (Discover, Likes You).
 * Sinon redirige vers /onboarding (si connecté mais profil incomplet) ou /auth (si non connecté).
 */
export function ProtectedRoute({ children }: Props) {
  const { user, isProfileComplete, isLoading, isAuthInitialized } = useAuth();
  const location = useLocation();

  if (!isAuthInitialized || isLoading) {
    return <SplashScreen />;
  }

  if (!user) {
    // TEMP DEBUG: auth resolved but no user.
    console.debug("[ProtectedRoute] redirect -> /auth", {
      path: location.pathname,
      isAuthInitialized,
      isLoading,
      hasUser: false,
    });
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!isProfileComplete) {
    // TEMP DEBUG: user present but profile not complete.
    console.debug("[ProtectedRoute] redirect -> /onboarding", {
      path: location.pathname,
      userId: user.id.slice(0, 8) + "…",
      isProfileComplete,
    });
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
