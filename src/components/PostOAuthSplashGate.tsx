import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
  subscribePostOAuthSplash,
  tryDismissPostOAuthSplashAfterLanding,
} from "../lib/postOAuthSplash";
import { subscribeOAuthUxOverlay } from "../lib/oauthUxNotify";
import { releasePostAuthUi } from "../lib/oauthUxRelease";
import { isGoogleSignInOverlayMounted } from "../lib/googleSignInOverlay";
import { isOauthProcessingLocked } from "../lib/oauthCallbackLock";
import {
  logOAuthLoadingScreenGate,
  shouldShowOAuthLoadingScreen,
} from "../lib/oauthLoadingScreenDiag";
import { forceReleaseOAuthLoadingOnMove } from "../lib/oauthLoadingScreenRelease";
import { isOAuthVisualMaskRequired } from "../lib/oauthVisualMask";
import {
  isOAuthSessionVerifiedLatch,
  subscribeOAuthSessionVerifiedLatch,
} from "../lib/oauthSessionVerifiedLatch";
import { OAuthLoadingScreenOverlay } from "./SploveOAuthLoadingScreen";

type Props = {
  children: ReactNode;
};

function subscribePostAuthSplashVisible(listener: () => void): () => void {
  const unsubSplash = subscribePostOAuthSplash(listener);
  const unsubUx = subscribeOAuthUxOverlay(listener);
  const unsubLatch = subscribeOAuthSessionVerifiedLatch(listener);
  return () => {
    unsubSplash();
    unsubUx();
    unsubLatch();
  };
}

function getPostAuthSplashRawVisible(): boolean {
  return (
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isGoogleSignInOverlayMounted()
  );
}

function hasResidualOAuthLoadingLocks(): boolean {
  return (
    isPostOAuthSplashRequested() ||
    isPostOAuthSplashActive() ||
    isGoogleSignInOverlayMounted() ||
    isOauthProcessingLocked()
  );
}

/** Flash post-OAuth Google uniquement — ne masque pas le splash natif au cold start. */
export function PostOAuthSplashGate({ children }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const sessionVerified =
    auth.isAuthInitialized && Boolean(auth.session?.user?.id);
  const sessionLatch = useSyncExternalStore(
    subscribeOAuthSessionVerifiedLatch,
    isOAuthSessionVerifiedLatch,
    () => false,
  );
  const rawShow = useSyncExternalStore(
    subscribePostAuthSplashVisible,
    getPostAuthSplashRawVisible,
    () => false,
  );
  const show = shouldShowOAuthLoadingScreen(rawShow, sessionVerified || sessionLatch);

  useEffect(() => {
    logOAuthLoadingScreenGate(
      "PostOAuthSplashGate",
      show,
      sessionVerified || sessionLatch
        ? ["session_verified"]
        : rawShow
          ? collectPostAuthBlockReasons()
          : ["hidden"],
    );
  }, [show, sessionVerified, sessionLatch, rawShow]);

  useEffect(() => {
    const pathname = location.pathname || "/";
    const ctx = {
      hasSession: Boolean(auth.session?.user?.id),
      profileBound: auth.profile?.id === auth.session?.user?.id,
      isAuthInitialized: auth.isAuthInitialized,
    };

    tryDismissPostOAuthSplashAfterLanding(pathname, ctx);

    if (!ctx.hasSession && !sessionLatch) return;
    if (!ctx.isAuthInitialized && !sessionLatch) return;

    if (pathname === "/move" && (show || rawShow || hasResidualOAuthLoadingLocks() || sessionLatch)) {
      if (!isOAuthVisualMaskRequired()) {
        forceReleaseOAuthLoadingOnMove("post_oauth_splash_move");
      }
      return;
    }

    if (hasResidualOAuthLoadingLocks() && !isOAuthVisualMaskRequired()) {
      releasePostAuthUi(
        "session_user_verified",
        pathname === "/move" ? "/move" : undefined,
      );
      return;
    }

    if (!ctx.profileBound) return;

    if (pathname === "/move" && (show || shouldForceMoveRelease(ctx))) {
      releasePostAuthUi("auth_redirect_move", "/move");
    }
  }, [
    auth.session?.user?.id,
    auth.profile?.id,
    auth.isAuthInitialized,
    location.pathname,
    show,
    rawShow,
    sessionLatch,
  ]);

  return (
    <>
      {children}
      <OAuthLoadingScreenOverlay gate="PostOAuthSplashGate" visible={show} />
    </>
  );
}

function collectPostAuthBlockReasons(): string[] {
  const reasons: string[] = [];
  if (isPostOAuthSplashRequested()) reasons.push("postOAuthSplashRequested");
  if (isPostOAuthSplashActive()) reasons.push("postOAuthSplashActive");
  if (isGoogleSignInOverlayMounted()) reasons.push("googleSignInOverlayMounted");
  if (isOauthProcessingLocked()) reasons.push("oauthProcessingLocked");
  return reasons;
}

function shouldForceMoveRelease(ctx: {
  hasSession: boolean;
  profileBound: boolean;
}): boolean {
  return (
    ctx.hasSession &&
    ctx.profileBound &&
    (isPostOAuthSplashRequested() ||
      isPostOAuthSplashActive() ||
      isGoogleSignInOverlayMounted())
  );
}
