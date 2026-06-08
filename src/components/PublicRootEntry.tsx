import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logBootDecision, resolveBootRoute } from "../lib/bootRouteDecision";
import { RouteBootLoader } from "./RouteBootLoader";

/** Point d’entrée `#/` : splash → une seule redirection auth / onboarding / move. */
export function PublicRootEntry() {
  const auth = useAuth();
  const decision = resolveBootRoute(auth);

  useEffect(() => {
    logBootDecision(decision, "/");
  }, [decision]);

  if (decision.status === "loading") {
    return <RouteBootLoader />;
  }

  if (decision.route === "/auth") {
    console.log("AUTH_NO_SESSION");
    return <Navigate to="/auth" replace />;
  }

  if (decision.route === "/onboarding") {
    console.log("AUTH_REDIRECT_ONBOARDING");
    return <Navigate to="/onboarding" replace />;
  }

  console.log("AUTH_REDIRECT_MOVE");
  return <Navigate to="/move" replace />;
}
