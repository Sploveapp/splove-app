import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logBootDecision, resolveBootRoute } from "../lib/bootRouteDecision";
import { RouteBootLoader } from "./RouteBootLoader";

type Props = {
  children: React.ReactNode;
};

/** Session + profil résolus avant toute route protégée — une seule redirection. */
export function ProtectedRoute({ children }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const pathname = location.pathname || "/";
  const isOnboardingPath = pathname === "/onboarding";
  const decision = resolveBootRoute(auth);

  useEffect(() => {
    logBootDecision(decision, pathname);
  }, [decision, pathname]);

  if (decision.status === "loading") {
    return <RouteBootLoader />;
  }

  if (decision.route === "/auth") {
    return <Navigate to="/auth" replace />;
  }

  if (decision.route === "/onboarding" && !isOnboardingPath) {
    return <Navigate to="/onboarding" replace />;
  }

  if (decision.route === "/move" && isOnboardingPath) {
    return <Navigate to="/move" replace />;
  }

  return <>{children}</>;
}
