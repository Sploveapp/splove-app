import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BOOT_SPLASH_MIN_MS } from "../lib/bootSplashTiming";
import { resolveBootRoute } from "../lib/bootRouteDecision";
import { useOAuthUxOverlayActive, isOAuthCallbackRouteBlocking } from "../lib/oauthUxOverlay";
import { isOAuthGoogleStartPath } from "../lib/oauthGoogleStartUrl";
import { logOAuthLoaderDiag } from "../lib/oauthLoaderDiag";
import { SploveOAuthLoadingScreen } from "./SploveOAuthLoadingScreen";
import { SplashScreen } from "./SplashScreen";

type Props = {
  children: ReactNode;
};

function isBooting(auth: ReturnType<typeof useAuth>, oauthUxActive: boolean, isAuthCallbackRoute: boolean): boolean {
  if (oauthUxActive || isAuthCallbackRoute) return true;
  if (resolveBootRoute(auth).status === "loading") return true;
  return false;
}

/**
 * Splash visible par défaut pendant boot — routes masquées en dessous.
 * Jamais de passthrough onboarding : évite le flash « prénom » pendant la vérif profil.
 */
export function BootSplashGate({ children }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const [minElapsed, setMinElapsed] = useState(false);

  const hash = location.hash || "";
  const pathname = location.pathname || "/";
  const isAuthCallbackRoute = isOAuthCallbackRouteBlocking(pathname, hash);
  const isOAuthGoogleStartRoute = isOAuthGoogleStartPath(pathname);
  const oauthUxActive = useOAuthUxOverlayActive({
    hasSession: Boolean(auth.session?.user?.id),
    pathname,
    hash,
  });
  const sessionOnMove =
    Boolean(auth.session?.user?.id) &&
    auth.isAuthInitialized &&
    (pathname === "/move" || hash.startsWith("#/move"));
  const booting = isBooting(auth, oauthUxActive, isAuthCallbackRoute);
  const showSplash = isOAuthGoogleStartRoute
    ? false
    : sessionOnMove
      ? oauthUxActive || isAuthCallbackRoute
      : booting || !minElapsed;

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), BOOT_SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSplash) {
      logOAuthLoaderDiag("WhiteScreenGuard/BootSplashGate", "render children (splash hidden)", {
        booting,
        minElapsed,
        oauthUxActive,
        authLoading: auth.isLoading,
        isAuthInitialized: auth.isAuthInitialized,
      });
      return;
    }
    logOAuthLoaderDiag(
      "WhiteScreenGuard/BootSplashGate",
      oauthUxActive || isAuthCallbackRoute ? "show SploveOAuthLoadingScreen" : "show SplashScreen",
      {
        booting,
        minElapsed,
        oauthUxActive,
        isAuthCallbackRoute,
        authLoading: auth.isLoading,
        isAuthInitialized: auth.isAuthInitialized,
        profileLoading: auth.isProfileLoading,
        pathname,
        hash,
      },
    );
  }, [
    showSplash,
    booting,
    minElapsed,
    oauthUxActive,
    isAuthCallbackRoute,
    auth.isLoading,
    auth.isAuthInitialized,
    auth.isProfileLoading,
    pathname,
    hash,
  ]);

  if (!showSplash) {
    return <>{children}</>;
  }

  return (
    <>
      {oauthUxActive || isAuthCallbackRoute ? <SploveOAuthLoadingScreen /> : <SplashScreen overlay />}
    </>
  );
}
