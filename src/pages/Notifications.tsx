import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotificationListItem } from "../components/notifications/NotificationListItem";
import { dispatchInAppNotificationsRefresh } from "../constants";
import { formatRelativeTime } from "../lib/formatRelativeTime";
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

  useEffect(() => {
    void load({ markAllReadOnOpen: true });
  }, [load]);

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
    <div className="min-h-full bg-app-bg font-sans">
      <main className="mx-auto max-w-md px-4 pb-8 pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 text-sm font-medium text-app-muted transition hover:text-app-text"
        >
          {`← ${t("discover_profiles")}`}
        </button>

        <h1 className="text-xl font-bold tracking-tight text-app-text">{t("in_app_notif.screen_title")}</h1>
        <p className="mt-1 mb-5 text-[13px] leading-snug text-app-muted">{t("in_app_notif.screen_subtitle")}</p>

        {loading ? (
          <p className="text-sm text-app-muted">{t("loading")}</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border/80 bg-app-card/40 px-4 py-12 text-center">
            <p className="text-sm text-app-muted">{t("in_app_notif.empty")}</p>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
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
