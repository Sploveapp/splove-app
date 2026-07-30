import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isNativeBottomNavVisibleRoute } from "../lib/bottomNavActiveTab";
import {
  CHAT_KEYBOARD_SHELL_EVENT,
  isChatConversationKeyboardOpen,
} from "../lib/chatConversationKeyboardShell";
import { syncNativeBottomNavShell } from "../lib/nativeShellBridge";

/** Masque la barre d’onglets native iOS hors session ou hors écrans principaux. */
export function NativeShellVisibilityBridge() {
  const { user, isAuthInitialized, isProfileComplete } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    const sync = () => {
      const routeVisible =
        isAuthInitialized &&
        Boolean(user?.id) &&
        isProfileComplete &&
        isNativeBottomNavVisibleRoute(pathname);
      const visible = routeVisible && !isChatConversationKeyboardOpen();
      syncNativeBottomNavShell({ visible, activePath: pathname });
    };

    sync();
    window.addEventListener(CHAT_KEYBOARD_SHELL_EVENT, sync);
    return () => window.removeEventListener(CHAT_KEYBOARD_SHELL_EVENT, sync);
  }, [user?.id, isAuthInitialized, isProfileComplete, pathname]);

  return null;
}
