import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { scheduleDevicePushPresenceSync, resetDevicePushPresenceCache } from "../lib/pushAppPresence";
import {
  initPushNotificationHandlers,
  offerPushNotificationsAfterLogin,
  setPushForegroundPathname,
  syncPushTokenIfGranted,
  teardownPushNotificationHandlers,
} from "../lib/pushNotifications";
import { registerPushNavigate } from "../lib/pushNavigate";

/** Enregistre la navigation push + présence + handlers natifs (dans HashRouter). */
export function PushNotificationsBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  useEffect(() => {
    registerPushNavigate((path, options) => {
      navigate(path, { replace: options?.replace ?? false });
    });
    return () => registerPushNavigate(null);
  }, [navigate]);

  useEffect(() => {
    if (!userId) {
      resetDevicePushPresenceCache();
      void teardownPushNotificationHandlers();
      return;
    }

    void (async () => {
      await initPushNotificationHandlers(userId);
      await syncPushTokenIfGranted(userId);
      void offerPushNotificationsAfterLogin(userId);
    })();

    return () => {
      void teardownPushNotificationHandlers();
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
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, location.pathname]);

  return null;
}
