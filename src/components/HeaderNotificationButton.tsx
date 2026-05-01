import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";

const ACCENT = "#E11D2E";
/** Cohérent avec fond header sombre (#0F0F14 via app-bg). */
const RING_SURFACE = "#0F0F14";

export type HeaderNotificationButtonProps = {
  hasNotification?: boolean;
};

export function HeaderNotificationButton({ hasNotification = false }: HeaderNotificationButtonProps) {
  const { t } = useTranslation();

  return (
    <Link
      to="/notifications"
      aria-label={t("in_app_notif.badge_aria")}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] outline-none ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:ring-white/[0.09] active:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25"
    >
      <Bell
        aria-hidden
        absoluteStrokeWidth
        size={20}
        strokeWidth={1.5}
        color={hasNotification ? ACCENT : "rgba(255, 255, 255, 0.72)"}
      />
      {hasNotification ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 h-[6px] w-[6px] rounded-full -translate-y-px translate-x-px"
          style={{
            backgroundColor: ACCENT,
            boxShadow: `0 0 0 2px ${RING_SURFACE}`,
          }}
        />
      ) : null}
    </Link>
  );
}
