import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { scheduleDevicePushPresenceSync, resetDevicePushPresenceCache } from "../lib/pushAppPresence";
import { clearNativeIconBadge, syncNativeIconBadge } from "../lib/pushBadgeSync";
import {
  initPushNotificationHandlers,
  offerPushNotificationsAfterLogin,
  setPushForegroundPathname,
  syncPushTokenIfGranted,
  teardownPushNotificationHandlers,
} from "../lib/pushNotifications";
import { flushPendingPushRoute, registerPushNavigate } from "../lib/pushNavigate";

/** Enregistre la navigation push + présence + handlers natifs (dans HashRouter). */
export function PushNotificationsBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const previousUserIdRef = useRef("");

  useEffect(() => {
    registerPushNavigate((path, options) => {
      navigate(path, { replace: options?.replace ?? false });
    });
    flushPendingPushRoute();
    return () => registerPushNavigate(null);
  }, [navigate]);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = userId;

    if (!userId) {
      resetDevicePushPresenceCache();
      clearNativeIconBadge();
      if (previousUserId) {
        void teardownPushNotificationHandlers(previousUserId);
      } else {
        void teardownPushNotificationHandlers();
      }
      return;
    }

    void (async () => {
      await initPushNotificationHandlers(userId);
      await syncPushTokenIfGranted(userId);
      await syncNativeIconBadge(userId);
      flushPendingPushRoute();
      void offerPushNotificationsAfterLogin(userId);
    })();

    return () => {
      void teardownPushNotificationHandlers(userId);
    };
  }, [userId]);

  useEffect(() => {
    setPushForegroundPathname(location.pathname);
    if (!userId) return;
    scheduleDevicePushPresenceSync(userId, location.pathname);
  }, [userId, location.pathname]);

  useEffect(() => {
    if (!userId) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleDevicePushPresenceSync(userId, location.pathname);
        void syncNativeIconBadge(userId);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, location.pathname]);

  return null;
}
