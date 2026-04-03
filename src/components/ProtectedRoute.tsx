import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  children: React.ReactNode;
};

/**
 * Protège les routes qui nécessitent une session ET un profil complet (Discover, Likes You).
 * Sinon redirige vers /onboarding (si connecté mais profil incomplet) ou /auth (si non connecté).
 */
export function ProtectedRoute({ children }: Props) {
  const { user, isProfileComplete, isLoading, error } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          background: "#0F0F14",
          boxSizing: "border-box",
        }}
      >
        <span style={{ color: "#64748b", fontSize: "15px" }}>Chargement…</span>
        {error ? (
          <span style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", maxWidth: 340 }}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!isProfileComplete) {
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
