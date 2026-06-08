import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import sploveMark from "../assets/welcome/splove-mark.png";
import { NotificationListItem } from "../components/notifications/NotificationListItem";
import { dispatchInAppNotificationsRefresh } from "../constants";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import {
  getPushRegistrationSummary,
  initPushNotificationHandlers,
  requestPushNotificationsPermission,
  syncPushTokenIfGranted,
  type PushPermissionState,
} from "../lib/pushNotifications";
import {
  isBellCenterNotificationRow,
  presentNotification,
  sortNotifications,
} from "../lib/sploveNotifications";
import { useTranslation } from "../i18n/useTranslation";
import { supabase } from "../lib/supabase";
import {
  fetchInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  pulseInAppNotifications,
  type InAppNotificationRow,
} from "../services/inAppNotifications.service";

export default function NotificationsPage() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InAppNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported");
  const [pushSavedInDb, setPushSavedInDb] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const markedAllOnOpenRef = useRef(false);

  const dateLocale = language === "en" ? "en-GB" : "fr-FR";

  const load = useCallback(async (options?: { markAllReadOnOpen?: boolean }) => {
    setLoading(true);
    try {
      void pulseInAppNotifications();
      const list = await fetchInAppNotifications(80);
      const filtered = list.filter(isBellCenterNotificationRow);
      setRows(sortNotifications(filtered));

      if (options?.markAllReadOnOpen && !markedAllOnOpenRef.current) {
        markedAllOnOpenRef.current = true;
        const hadUnread = filtered.some((r) => !r.read);
        if (hadUnread) {
          await markAllInAppNotificationsRead();
          setRows((prev) => prev.map((r) => ({ ...r, read: true })));
        }
      }
      dispatchInAppNotificationsRefresh();
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPushStatus = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setPushPermission("unsupported");
      setPushSavedInDb(false);
      return;
    }
    await initPushNotificationHandlers(user.id);
    await syncPushTokenIfGranted(user.id);
    const summary = await getPushRegistrationSummary(user.id);
    setPushPermission(summary.permission);
    setPushSavedInDb(summary.savedInDb);
  }, []);

  useEffect(() => {
    void load({ markAllReadOnOpen: true });
  }, [load]);

  useEffect(() => {
    void refreshPushStatus();
  }, [refreshPushStatus]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || cancelled) return;

      const ch = supabase
        .channel(`notifications-center:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "in_app_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void load();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "in_app_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void load();
          },
        )
        .subscribe();

      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      realtimeRef.current = ch;
    })();

    return () => {
      cancelled = true;
      const ch = realtimeRef.current;
      realtimeRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [load]);

  const sorted = useMemo(() => sortNotifications(rows), [rows]);

  async function handleEnablePush() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || pushEnabling) return;
    setPushEnabling(true);
    try {
      const result = await requestPushNotificationsPermission(user.id);
      setPushPermission(result);
      const summary = await getPushRegistrationSummary(user.id);
      setPushSavedInDb(summary.savedInDb);
    } finally {
      setPushEnabling(false);
    }
  }

  async function handleOpen(row: InAppNotificationRow) {
    const presentation = presentNotification(row, t);
    if (!row.read) {
      await markInAppNotificationRead(row.id);
      setRows((prev) =>
        sortNotifications(prev.map((r) => (r.id === row.id ? { ...r, read: true } : r))),
      );
      dispatchInAppNotificationsRefresh();
    }
    const route = presentation.route;
    if (route.includes("?")) {
      const [path, query] = route.split("?");
      navigate({ pathname: path, search: `?${query}` });
    } else {
      navigate(route);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-app-bg font-sans">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 text-sm font-medium text-app-muted transition hover:text-app-text"
        >
          {`← ${t("back")}`}
        </button>

        <h1 className="text-xl font-bold tracking-tight text-app-text">{t("in_app_notif.screen_title")}</h1>
        <p className="mt-1 text-[13px] leading-snug text-app-muted">{t("in_app_notif.screen_subtitle")}</p>

        {pushPermission !== "unsupported" ? (
          <section
            className="mt-4 rounded-2xl border border-app-border bg-app-card/80 px-4 py-3.5"
            aria-labelledby="push-notif-prompt-title"
          >
            <h2 id="push-notif-prompt-title" className="text-sm font-semibold text-app-text">
              {t("push_notif.enable_title")}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-app-muted">{t("push_notif.enable_body")}</p>
            {pushPermission === "granted" && pushSavedInDb ? (
              <p className="mt-3 text-[13px] font-medium text-emerald-400/90">{t("push_notif.enabled_status")}</p>
            ) : pushPermission === "denied" ? (
              <p className="mt-3 text-[13px] leading-snug text-app-muted">{t("push_notif.denied_hint")}</p>
            ) : (
              <button
                type="button"
                disabled={pushEnabling}
                onClick={() => void handleEnablePush()}
                className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-70"
                style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
              >
                {pushEnabling ? t("loading") : t("push_notif.enable_button")}
              </button>
            )}
          </section>
        ) : (
          <p className="mt-3 text-[12px] leading-snug text-app-muted/80">{t("push_notif.unsupported")}</p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-app-muted">{t("loading")}</p>
        ) : sorted.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center px-4 py-10"
            aria-label={t("in_app_notif.empty")}
          >
            <div className="flex flex-col items-center translate-y-6">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
              <img
                src={sploveMark}
                alt=""
                className="absolute h-14 w-14 object-contain opacity-[0.18]"
                aria-hidden
              />
              <Bell size={22} strokeWidth={1.5} className="relative text-white/35" aria-hidden />
            </div>
              <p className="max-w-[17rem] text-center text-[14px] leading-relaxed text-app-muted/90">
                {t("in_app_notif.empty_body")}
              </p>
            </div>
          </div>
        ) : (
          <ul className="m-0 mt-5 list-none space-y-2 p-0">
            {sorted.map((row) => {
              const presentation = presentNotification(row, t);
              const relativeTime = formatRelativeTime(row.created_at, dateLocale, nowTick);
              return (
                <NotificationListItem
                  key={row.id}
                  presentation={presentation}
                  relativeTime={relativeTime}
                  unread={!row.read}
                  onOpen={() => void handleOpen(row)}
                />
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
