import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";
import { PostLoginProfileSplash } from "./PostLoginProfileSplash";
import WelcomeSPLove from "../pages/WelcomeSPLove";

/**
 * Point d’entrée `#/` : accueil SPLove si non connecté ; sinon mêmes cibles que les guards existants.
 */
export function PublicRootEntry() {
  const { user, session, isAuthInitialized, isLoading, isProfileLoading, isProfileComplete } = useAuth();

  if (!isAuthInitialized || isLoading) {
    return <SplashScreen />;
  }
  if (session?.user?.id && isProfileLoading) {
    return <PostLoginProfileSplash />;
  }
  if (user?.id && isProfileComplete) {
    return <Navigate to="/discover" replace />;
  }
  if (user?.id && !isProfileComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <WelcomeSPLove />;
}
