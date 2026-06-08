import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isOauthProcessingLocked } from "../lib/oauthCallbackLock";
import { resolveBootRoute } from "../lib/bootRouteDecision";
import { BOOT_SPLASH_MIN_MS } from "../lib/bootSplashTiming";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: ReactNode;
};

function isBooting(auth: ReturnType<typeof useAuth>, oauthLocked: boolean, isAuthCallbackRoute: boolean): boolean {
  if (oauthLocked || isAuthCallbackRoute) return true;
  if (!auth.isAuthInitialized || auth.isLoading) return true;
  const decision = resolveBootRoute(auth);
  return decision.status === "loading";
}

/**
 * Splash visible par défaut pendant boot — routes masquées en dessous.
 */
export function BootSplashGate({ children }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const [minElapsed, setMinElapsed] = useState(false);

  const hash = location.hash || "";
  const isAuthCallbackRoute =
    location.pathname === "/auth/callback" || hash.startsWith("#/auth/callback");
  const oauthLocked = isOauthProcessingLocked();
  const booting = isBooting(auth, oauthLocked, isAuthCallbackRoute);
  const showSplash = booting || !minElapsed;

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), BOOT_SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {showSplash ? <SplashScreen overlay /> : null}
      <div
        aria-hidden={showSplash}
        style={
          showSplash
            ? {
                visibility: "hidden",
                pointerEvents: "none",
                position: "fixed",
                inset: 0,
                overflow: "hidden",
                width: 0,
                height: 0,
              }
            : undefined
        }
      >
        {children}
      </div>
    </>
  );
}
