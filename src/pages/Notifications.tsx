import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotificationListItem } from "../components/notifications/NotificationListItem";
import { dispatchInAppNotificationsRefresh } from "../constants";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { presentNotification, sortNotifications } from "../lib/sploveNotifications";
import { useTranslation } from "../i18n/useTranslation";
import {
  fetchInAppNotifications,
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

  const dateLocale = language === "en" ? "en-GB" : "fr-FR";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      void pulseInAppNotifications();
      const list = await fetchInAppNotifications(80);
      setRows(sortNotifications(list));
      dispatchInAppNotificationsRefresh();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const unreadCount = sorted.filter((r) => !r.read).length;

  return (
    <div className="min-h-full bg-app-bg font-sans">
      <main className="mx-auto max-w-md px-5 pb-8 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 text-sm font-semibold text-app-muted transition hover:text-app-text"
        >
          {`← ${t("discover_profiles")}`}
        </button>

        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="text-xl font-bold text-app-text">{t("in_app_notif.screen_title")}</h1>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-[#FF1E2D]/15 px-2.5 py-0.5 text-[12px] font-semibold text-[#FF1E2D]">
              {unreadCount}
            </span>
          ) : null}
        </div>

        <p className="mb-4 text-[13px] leading-snug text-app-muted">{t("in_app_notif.screen_subtitle")}</p>

        {loading ? (
          <p className="text-sm text-app-muted">{t("loading")}</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border bg-app-card/60 px-4 py-10 text-center">
            <p className="text-sm text-app-muted">{t("in_app_notif.empty")}</p>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2.5 p-0">
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
