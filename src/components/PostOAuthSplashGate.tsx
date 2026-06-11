/**
 * Gate overlay noir SPLove — seul point de dismiss sur le chemin succès OAuth.
 *
 * - Affiche l’overlay tant que `isPostOAuthSplashRequested()` (clic Google → route finale)
 * - Retire l’overlay via `tryDismissPostOAuthSplashAfterLanding` sur /move, /onboarding,
 *   /identity-verification quand session + profil sont liés
 * - Timeout → `abortPostOAuthSplash` (garde-fou, pas un dismiss succès)
 *
 * Interdit ailleurs : dismiss avant navigation finale confirmée (AuthCallback succès, etc.).
 */

import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  POST_OAUTH_MAX_MS,
  abortPostOAuthSplash,
  isPostOAuthSplashRequested,
  markPostOAuthSplashActive,
  subscribePostOAuthSplash,
  tryDismissPostOAuthSplashAfterLanding,
} from "../lib/postOAuthSplash";
import { SploveOAuthLoadingScreen } from "./SploveOAuthLoadingScreen";

type Props = {
  children: ReactNode;
};

export function PostOAuthSplashGate({ children }: Props) {
  const location = useLocation();
  const { session, profile, isAuthInitialized } = useAuth();
  const [show, setShow] = useState(() => isPostOAuthSplashRequested());

  useEffect(() => {
    return subscribePostOAuthSplash(() => {
      setShow(isPostOAuthSplashRequested());
    });
  }, []);

  useEffect(() => {
    if (!show) return;

    markPostOAuthSplashActive();
    console.log("[Splash] post oauth shown");

    tryDismissPostOAuthSplashAfterLanding(location.pathname, {
      hasSession: !!session?.user?.id,
      profileBound: !!profile?.id && profile.id === session?.user?.id,
      isAuthInitialized,
    });

    const maxTimer = window.setTimeout(() => {
      abortPostOAuthSplash();
      console.log("[Splash] post oauth hidden (timeout abort)");
    }, POST_OAUTH_MAX_MS);

    return () => window.clearTimeout(maxTimer);
  }, [show, location.pathname, session, profile, isAuthInitialized]);

  return (
    <>
      {children}
      {show ? <SploveOAuthLoadingScreen /> : null}
    </>
  );
}
