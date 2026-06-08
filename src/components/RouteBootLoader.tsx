import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  logBootDecision,
  logBootProfileLoaded,
  logBootSessionLoaded,
  resolveBootRoute,
} from "../lib/bootRouteDecision";
import { SplashScreen } from "./SplashScreen";

/** Garde route : splash visible tant que boot en cours (doublure si BootSplashGate absent). */
export function RouteBootLoader() {
  const auth = useAuth();
  const decision = resolveBootRoute(auth);

  useEffect(() => {
    if (auth.isAuthInitialized && !auth.isLoading) {
      logBootSessionLoaded(auth.session?.user?.id);
    }
  }, [auth.isAuthInitialized, auth.isLoading, auth.session?.user?.id]);

  useEffect(() => {
    if (!auth.isProfileLoading && auth.profile?.id) {
      logBootProfileLoaded(auth.profile, auth.isProfileComplete);
    }
  }, [auth.isProfileLoading, auth.profile, auth.isProfileComplete]);

  useEffect(() => {
    logBootDecision(decision, "RouteBootLoader");
  }, [decision]);

  return <SplashScreen overlay />;
}
