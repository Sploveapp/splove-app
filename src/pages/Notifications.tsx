import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  APP_BG,
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
} from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import {
  fetchInAppNotifications,
  markInAppNotificationRead,
  pulseInAppNotifications,
  type InAppNotificationRow,
} from "../services/inAppNotifications.service";

function linesForKind(
  t: (key: string) => string,
  kind: string,
): { title: string; message: string } {
  const map: Record<string, { titleKey: string; messageKey: string }> = {
    invite_link_sent_delay: {
      titleKey: "in_app_notif.invite_link_sent_delay.title",
      messageKey: "in_app_notif.invite_link_sent_delay.message",
    },
    invite_followup_day1: {
      titleKey: "in_app_notif.invite_followup_day1.title",
      messageKey: "in_app_notif.invite_followup_day1.message",
    },
    referrer_zone_unlocked: {
      titleKey: "in_app_notif.referrer_zone_unlocked.title",
      messageKey: "in_app_notif.referrer_zone_unlocked.message",
    },
    discover_low_engagement_48h: {
      titleKey: "in_app_notif.discover_low_engagement_48h.title",
      messageKey: "in_app_notif.discover_low_engagement_48h.message",
    },
  };
  const keys = map[kind];
  if (!keys) {
    return { title: kind, message: "" };
  }
  return { title: t(keys.titleKey), message: t(keys.messageKey) };
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InAppNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      void pulseInAppNotifications();
      const list = await fetchInAppNotifications();
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleOpen(row: InAppNotificationRow) {
    await markInAppNotificationRead(row.id);
    void pulseInAppNotifications();
    navigate("/discover", { replace: false });
  }

  return (
    <div
      style={{
        minHeight: "100%",
        background: APP_BG,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <main style={{ padding: "24px", maxWidth: "420px", margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => navigate("/discover")}
          style={{
            margin: "0 0 16px 0",
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
            color: APP_TEXT_MUTED,
          }}
        >
          {`← ${t("discover_profiles")}`}
        </button>

        <h1
          style={{
            margin: "0 0 16px 0",
            fontSize: "20px",
            fontWeight: 700,
            color: APP_TEXT,
          }}
        >
          {t("in_app_notif.screen_title")}
        </h1>

        {loading ? (
          <p style={{ margin: 0, fontSize: "14px", color: APP_TEXT_MUTED }}>{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: "14px", color: APP_TEXT_MUTED }}>{t("in_app_notif.empty")}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {rows.map((row) => {
              const { title, message } = linesForKind(t, row.kind);
              return (
                <li key={row.id} style={{ marginBottom: "12px" }}>
                  <button
                    type="button"
                    onClick={() => void handleOpen(row)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: "16px",
                      border: `1px solid ${APP_BORDER}`,
                      background: APP_CARD,
                      cursor: "pointer",
                      display: "block",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      {!row.read ? (
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "999px",
                            background: "#FF1E2D",
                            flexShrink: 0,
                          }}
                          aria-hidden
                        />
                      ) : (
                        <span style={{ width: "8px", flexShrink: 0 }} aria-hidden />
                      )}
                      <span style={{ fontSize: "15px", fontWeight: 700, color: APP_TEXT }}>{title}</span>
                    </span>
                    <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: APP_TEXT_MUTED }}>
                      {message}
                    </p>
                    <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: APP_TEXT_MUTED, opacity: 0.85 }}>
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
