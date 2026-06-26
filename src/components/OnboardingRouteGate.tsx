import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logBootDecision, resolveBootRoute } from "../lib/bootRouteDecision";
import { logOAuthLoaderDiag } from "../lib/oauthLoaderDiag";
import { logOAuthRedirectDestination } from "../lib/oauthSessionRecoveryDiag";
import Onboarding from "../pages/Onboarding";
import { SplashScreen } from "./SplashScreen";

/**
 * Garde route /onboarding (hors ProtectedRoute) — splash tant que le profil n’est pas résolu,
 * redirection /move si déjà complet. N’altère pas le contenu de la page Onboarding.
 */
export function OnboardingRouteGate() {
  const auth = useAuth();
  const decision = resolveBootRoute(auth);

  useEffect(() => {
    logBootDecision(decision, "/onboarding");
  }, [decision]);

  if (decision.status === "ready" && decision.route === "/onboarding") {
    logOAuthRedirectDestination("onboarding_route_gate", "/onboarding", {
      hasSession: Boolean(auth.session?.user?.id),
      profileId: auth.profile?.id ?? null,
      decisionReason: decision.reason,
    });
  }

  if (decision.status === "loading") {
    logOAuthLoaderDiag("ReactGuard/OnboardingRouteGate", "splash (profile bootstrap)", {
      authLoading: auth.isLoading,
      profileLoading: auth.isProfileLoading,
      isProfileComplete: auth.isProfileComplete,
      decisionReason: decision.reason,
      onboardingCompleted: (auth.profile as Record<string, unknown> | null)?.onboarding_completed ?? null,
    });
    return <SplashScreen overlay />;
  }

  if (decision.status === "ready" && decision.route === "/move") {
    logOAuthLoaderDiag("ReactGuard/OnboardingRouteGate", "navigate /move (profile complete)", {
      isProfileComplete: auth.isProfileComplete,
      decisionReason: decision.reason,
    });
    return <Navigate to="/move" replace />;
  }

  if (decision.status === "ready" && decision.route === "/auth") {
    return <Navigate to="/auth" replace />;
  }

  return <Onboarding />;
}
