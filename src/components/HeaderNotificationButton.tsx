import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { formatBadge } from "../lib/formatBadge";
import { useTranslation } from "../i18n/useTranslation";

const ACCENT = "#E11D2E";
/** Cohérent avec fond header sombre (#0F0F14 via app-bg). */
const RING_SURFACE = "#0F0F14";

export type HeaderNotificationButtonProps = {
  unreadCount?: number;
};

export function HeaderNotificationButton({ unreadCount = 0 }: HeaderNotificationButtonProps) {
  const { t } = useTranslation();
  const hasUnread = unreadCount > 0;
  const badgeLabel = hasUnread ? formatBadge(unreadCount) : null;

  return (
    <Link
      to="/notifications"
      aria-label={
        hasUnread
          ? `${t("in_app_notif.badge_aria")} (${unreadCount})`
          : t("in_app_notif.badge_aria")
      }
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] outline-none ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:ring-white/[0.09] active:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25"
    >
      <Bell
        aria-hidden
        absoluteStrokeWidth
        size={20}
        strokeWidth={1.5}
        color={hasUnread ? ACCENT : "rgba(255, 255, 255, 0.72)"}
      />
      {badgeLabel ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
          style={{
            backgroundColor: ACCENT,
            boxShadow: `0 0 0 2px ${RING_SURFACE}`,
          }}
          aria-hidden
        >
          {badgeLabel}
        </span>
      ) : null}
    </Link>
  );
}
