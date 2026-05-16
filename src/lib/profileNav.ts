import type { NavigateFunction } from "react-router-dom";

export const USER_PROFILE_PATH = "/profile";

export type ProfileNavLog = {
  currentPath: string;
  targetPath: string;
  reason: string;
  activityProposalsNeedAction: boolean;
};

export function logProfileNav(entry: ProfileNavLog): void {
  console.log("[PROFILE_NAV]", { ...entry, viteDev: import.meta.env.DEV });
}

/** Bottom nav Profil → hub profil principal uniquement (jamais Mes rencontres). */
export function navigateToUserProfile(
  navigate: NavigateFunction,
  params: {
    currentPath: string;
    reason: string;
    activityProposalsNeedAction: boolean;
  },
): void {
  const targetPath = USER_PROFILE_PATH;
  console.log("[PROFILE_CLICK_HANDLER]", {
    source: "profileNav.navigateToUserProfile",
    currentPath: params.currentPath,
    targetPath,
    reason: params.reason,
    activityProposalsNeedAction: params.activityProposalsNeedAction,
  });
  logProfileNav({
    currentPath: params.currentPath,
    targetPath,
    reason: params.reason,
    activityProposalsNeedAction: params.activityProposalsNeedAction,
  });
  const leavingMeetups =
    params.currentPath === "/mes-rencontres" ||
    params.currentPath.startsWith("/mes-rencontres/");
  navigate(targetPath, { replace: leavingMeetups });
}
