import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: React.ReactNode;
};

/**
 * Session uniquement : pas de garde sur le profil (Discover reste accessible pendant le chargement profil).
 */
export function ProtectedRoute({ children }: Props) {
  const { session, isLoading } = useAuth();
  console.log("[ProtectedRoute] session", session);
  console.log("[ProtectedRoute] isLoading", isLoading);

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
