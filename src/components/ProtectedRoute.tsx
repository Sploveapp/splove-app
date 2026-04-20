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
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!isProfileComplete) {
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
