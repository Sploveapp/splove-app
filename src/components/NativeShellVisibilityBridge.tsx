import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { syncNativeBottomNavigationVisible } from "../lib/nativeShellBridge";

/** Barre native iOS — uniquement les 4 onglets principaux (pas onboarding / chat / réglages). */
const NATIVE_BOTTOM_NAV_ROUTES = new Set(["/move", "/likes-you", "/messages", "/profile"]);

/** Masque la barre d’onglets native iOS hors session ou hors écrans principaux. */
export function NativeShellVisibilityBridge() {
  const { user, isAuthInitialized, isProfileComplete } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    const visible =
      isAuthInitialized &&
      Boolean(user?.id) &&
      isProfileComplete &&
      NATIVE_BOTTOM_NAV_ROUTES.has(pathname);
    syncNativeBottomNavigationVisible(visible);
  }, [user?.id, isAuthInitialized, isProfileComplete, pathname]);

  return null;
}
