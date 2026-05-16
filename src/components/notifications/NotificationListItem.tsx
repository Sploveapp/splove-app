import { NAV_BADGE_NOTIFICATION } from "../../constants/theme";
import type { NotificationPresentation } from "../../lib/sploveNotifications";

type Props = {
  presentation: NotificationPresentation;
  relativeTime: string;
  unread: boolean;
  onOpen: () => void;
};

export function NotificationListItem({ presentation, relativeTime, unread, onOpen }: Props) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl border border-app-border/90 bg-app-card px-4 py-3.5 text-left shadow-sm transition hover:bg-app-border/20 active:bg-app-border/30"
      >
        <div className="flex gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-bg text-lg"
            aria-hidden
          >
            {presentation.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug text-app-text">{presentation.line}</p>
            {presentation.subtitle ? (
              <p className="mt-1 text-[13px] leading-snug text-app-muted">{presentation.subtitle}</p>
            ) : null}
            {relativeTime ? (
              <p className="mt-1.5 text-[11px] text-app-muted opacity-90">{relativeTime}</p>
            ) : null}
          </div>
          {unread ? (
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: NAV_BADGE_NOTIFICATION }}
              aria-hidden
            />
          ) : null}
        </div>
      </button>
    </li>
  );
}
