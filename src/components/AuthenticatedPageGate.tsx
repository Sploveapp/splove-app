import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { resolveAppShellState } from "../lib/appShellState";
import { useOAuthUxOverlayActive } from "../lib/oauthUxOverlay";
import { logOAuthLoaderDiag } from "../lib/oauthLoaderDiag";
import { logOAuthLoadingScreenGate } from "../lib/oauthLoadingScreenDiag";
import { SploveOAuthLoadingScreen } from "./SploveOAuthLoadingScreen";
import { SplashScreen } from "./SplashScreen";
import { LikesListSkeleton } from "./skeletons/LikesListSkeleton";
import { MessagesListSkeleton } from "./skeletons/MessagesListSkeleton";
import { ProfileScreenSkeleton } from "./skeletons/ProfileScreenSkeleton";
import { EditProfileFormSkeleton } from "./skeletons/EditProfileFormSkeleton";
import { MoveProfileSkeleton } from "./discover/MoveProfileSkeleton";

type Props = {
  children: ReactNode;
};

function shellSkeletonForPath(pathname: string): ReactNode | null {
  if (pathname === "/move" || pathname === "/discover" || pathname === "/") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0B0B0F] px-3 pb-28 pt-2">
        <MoveProfileSkeleton immersive />
      </div>
    );
  }
  if (pathname === "/likes-you" || pathname === "/likes") {
    return <LikesListSkeleton />;
  }
  if (pathname === "/messages") {
    return <MessagesListSkeleton />;
  }
  if (pathname === "/profile") {
    return <ProfileScreenSkeleton />;
  }
  if (pathname === "/profile/edit") {
    return <EditProfileFormSkeleton />;
  }
  return null;
}

/**
 * Garde shell authentifié : splash uniquement tant que la session n'est pas résolue ;
 * skeleton de page pendant le premier bootstrap profil.
 */
export function AuthenticatedPageGate({ children }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const pathname = location.pathname || "/";

  const shell = resolveAppShellState({
    isAuthInitialized: auth.isAuthInitialized,
    isLoading: auth.isLoading,
    sessionUserId: auth.session?.user?.id,
    profileId: auth.profile?.id,
  });

  const oauthUxActive = useOAuthUxOverlayActive({
    hasSession: Boolean(auth.session?.user?.id),
    pathname,
    hash: typeof window !== "undefined" ? window.location.hash : "",
  });

  useEffect(() => {
    if (oauthUxActive) {
      logOAuthLoadingScreenGate("AuthenticatedPageGate", true, ["oauthUxActive"]);
      logOAuthLoaderDiag("WhiteScreenGuard/AuthenticatedPageGate", "blocked → SploveOAuthLoadingScreen", {
        authLoading: auth.isLoading,
        profileLoading: auth.isProfileLoading,
        isAuthInitialized: auth.isAuthInitialized,
        isProfileComplete: auth.isProfileComplete,
        onboardingCompleted: (auth.profile as Record<string, unknown> | null)?.onboarding_completed ?? null,
        authResolved: shell.authResolved,
        profileResolved: shell.profileResolved,
        pathname,
      });
      return;
    }
    logOAuthLoadingScreenGate("AuthenticatedPageGate", false);
    if (!shell.authResolved) {
      logOAuthLoaderDiag("WhiteScreenGuard/AuthenticatedPageGate", "blocked → SplashScreen (auth unresolved)", {
        authLoading: auth.isLoading,
        isAuthInitialized: auth.isAuthInitialized,
        bootstrapLoading: !shell.authResolved,
        pathname,
      });
      return;
    }
    if (auth.session?.user?.id && !shell.profileResolved && shellSkeletonForPath(pathname)) {
      logOAuthLoaderDiag("WhiteScreenGuard/AuthenticatedPageGate", "blocked → page skeleton", {
        profileLoading: auth.isProfileLoading,
        profileResolved: shell.profileResolved,
        pathname,
      });
      return;
    }
    logOAuthLoaderDiag("WhiteScreenGuard/AuthenticatedPageGate", "pass-through → children", {
      authLoading: auth.isLoading,
      profileLoading: auth.isProfileLoading,
      authResolved: shell.authResolved,
      profileResolved: shell.profileResolved,
      pathname,
    });
  }, [
    oauthUxActive,
    shell.authResolved,
    shell.profileResolved,
    auth.isLoading,
    auth.isProfileLoading,
    auth.isAuthInitialized,
    auth.isProfileComplete,
    auth.profile,
    auth.session?.user?.id,
    pathname,
  ]);

  if (
    pathname === "/onboarding" &&
    shell.authResolved &&
    !auth.isProfileLoading &&
    !oauthUxActive
  ) {
    return <>{children}</>;
  }

  if (oauthUxActive) {
    return <SploveOAuthLoadingScreen />;
  }

  if (!shell.authResolved) {
    return <SplashScreen overlay />;
  }

  if (auth.session?.user?.id && !shell.profileResolved) {
    const skeleton = shellSkeletonForPath(pathname);
    if (skeleton) return skeleton;
  }

  return <>{children}</>;
}
