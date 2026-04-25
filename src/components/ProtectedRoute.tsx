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
  const { user, profile, isProfileComplete, profileIncompleteReason, isLoading, isAuthInitialized } = useAuth();
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  const incompleteProfileAllowedPaths = ["/onboarding", "/cgu", "/privacy", "/auth", "/logout"];
  const canAccessWhileIncomplete = incompleteProfileAllowedPaths.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );

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
    const maybeProfile = profile as Record<string, unknown> | null;
    const hasPhoto =
      typeof maybeProfile?.main_photo_url === "string" && String(maybeProfile.main_photo_url).trim() !== "" ||
      typeof maybeProfile?.portrait_url === "string" && String(maybeProfile.portrait_url).trim() !== "" ||
      typeof maybeProfile?.fullbody_url === "string" && String(maybeProfile.fullbody_url).trim() !== "";
    const hasSports =
      Number(maybeProfile?.onboarding_sports_count ?? 0) > 0 ||
      Number(maybeProfile?.onboarding_sports_with_level_count ?? 0) > 0;
    console.warn("ONBOARDING_REDIRECT_REASON", {
      first_name: maybeProfile?.first_name ?? null,
      birth_date: maybeProfile?.birth_date ?? null,
      gender: maybeProfile?.gender ?? null,
      looking_for: maybeProfile?.looking_for ?? null,
      meet_pref: maybeProfile?.meet_pref ?? maybeProfile?.intent ?? null,
      hasSports,
      hasPhoto,
      accepted_terms_at: maybeProfile?.accepted_terms_at ?? null,
      accepted_privacy_at: maybeProfile?.accepted_privacy_at ?? null,
      profile_completed: maybeProfile?.profile_completed ?? null,
      onboarding_completed: maybeProfile?.onboarding_completed ?? null,
      reason: profileIncompleteReason ?? "unknown",
    });
    if (canAccessWhileIncomplete) {
      return <>{children}</>;
    }
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
