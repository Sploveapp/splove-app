import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BOOT_SPLASH_MIN_MS } from "../lib/bootSplashTiming";
import { resolveBootRoute } from "../lib/bootRouteDecision";
import {
  useOAuthUxOverlayActive,
  isOAuthCallbackRouteBlocking,
} from "../lib/oauthUxOverlay";
import {
  installOAuthTechnicalUrlGuardListeners,
  isOAuthVisualMaskRequired,
} from "../lib/oauthVisualMask";
import { isOAuthGoogleStartPath } from "../lib/oauthGoogleStartUrl";
import { logOAuthLoaderDiag } from "../lib/oauthLoaderDiag";
import {
  logOAuthLoadingScreenGate,
  shouldSuppressOAuthLoadingOnMoveRoute,
} from "../lib/oauthLoadingScreenDiag";
import { OAuthLoadingScreenOverlay } from "./SploveOAuthLoadingScreen";
import { SplashScreen } from "./SplashScreen";
import {
  isOAuthSessionVerifiedLatch,
  subscribeOAuthSessionVerifiedLatch,
} from "../lib/oauthSessionVerifiedLatch";
import { isPasswordRecoveryFlowActive } from "../lib/passwordRecoveryDeepLink";

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
  const sessionLatch = useSyncExternalStore(
    subscribeOAuthSessionVerifiedLatch,
    isOAuthSessionVerifiedLatch,
    () => false,
  );

  const hash = location.hash || "";
  const pathname = location.pathname || "/";
  const isResetPasswordRoute =
    pathname === "/reset-password" || hash.startsWith("#/reset-password");
  const recoveryGate = isResetPasswordRoute || isPasswordRecoveryFlowActive();
  const authSessionVerified =
    auth.isAuthInitialized && Boolean(auth.session?.user?.id);
  const isAuthCallbackRoute = isOAuthCallbackRouteBlocking(pathname, hash);
  const isOAuthGoogleStartRoute = isOAuthGoogleStartPath(pathname);
  const oauthVisualMask = isOAuthVisualMaskRequired({ pathname, hash });
  const oauthUxActive = useOAuthUxOverlayActive({
    hasSession: authSessionVerified || sessionLatch,
    pathname,
    hash,
  });
  const sessionOnMove =
    (authSessionVerified || sessionLatch) &&
    (pathname === "/move" || hash.startsWith("#/move"));
  const sessionOnProfile =
    (authSessionVerified || sessionLatch) &&
    (pathname === "/profile" || hash.startsWith("#/profile"));
  const sessionOnFinalRoute = sessionOnMove || sessionOnProfile;
  const suppressOAuthOnMove = shouldSuppressOAuthLoadingOnMoveRoute(
    pathname,
    hash,
    authSessionVerified || sessionLatch,
  );
  const oauthLoadingVisible =
    oauthVisualMask ||
    ((oauthUxActive || isAuthCallbackRoute || isOAuthGoogleStartRoute) &&
      !suppressOAuthOnMove &&
      !sessionLatch);
  const booting = recoveryGate
    ? false
    : isBooting(auth, oauthUxActive || oauthVisualMask, isAuthCallbackRoute);
  const showSplash = recoveryGate
    ? false
    : sessionOnFinalRoute
    ? oauthLoadingVisible
    : sessionLatch && suppressOAuthOnMove && !oauthVisualMask
      ? false
      : booting || !minElapsed || isOAuthGoogleStartRoute || oauthVisualMask;

  useEffect(() => {
    installOAuthTechnicalUrlGuardListeners();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), BOOT_SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (showSplash && oauthLoadingVisible) {
      logOAuthLoadingScreenGate("BootSplashGate", true, [
        ...(oauthUxActive ? ["oauthUxActive"] : []),
        ...(isAuthCallbackRoute ? ["authCallbackRoute"] : []),
        ...(isOAuthGoogleStartRoute ? ["oauthGoogleStartRoute"] : []),
        ...(oauthVisualMask ? ["oauthVisualMask"] : []),
        ...(sessionOnMove ? ["sessionOnMove"] : []),
        ...(sessionOnProfile ? ["sessionOnProfile"] : []),
      ]);
    } else if (!oauthLoadingVisible) {
      logOAuthLoadingScreenGate("BootSplashGate", false);
    }

    if (!showSplash) {
      console.log("BOOT_SPLASH_RELEASED", {
        booting,
        minElapsed,
        pathname,
        hash,
      });
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
    sessionOnMove,
    sessionOnProfile,
    oauthVisualMask,
    oauthLoadingVisible,
    sessionLatch,
    suppressOAuthOnMove,
  ]);

  if (!showSplash) {
    return <>{children}</>;
  }

  return (
    <>
      <OAuthLoadingScreenOverlay gate="BootSplashGate" visible={oauthLoadingVisible} />
      {!oauthLoadingVisible ? <SplashScreen overlay /> : null}
    </>
  );
}
