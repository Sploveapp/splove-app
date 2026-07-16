import { NAV_BADGE_NOTIFICATION } from "../../constants/theme";
import { useEffect } from "react";
import { useProfilePhotoSignedUrl } from "../../hooks/useProfilePhotoSignedUrl";
import type { NotificationPresentation } from "../../lib/sploveNotifications";
import { logPhotoComponent, logPhotoTrace, logPhotoTraceImgEvent } from "../../lib/photoTraceLog";

type Props = {
  presentation: NotificationPresentation;
  relativeTime: string;
  unread: boolean;
  onOpen: () => void;
};

export function NotificationListItem({ presentation, relativeTime, unread, onOpen }: Props) {
  const avatarUrl = useProfilePhotoSignedUrl(presentation.actorAvatarUrl);

  useEffect(() => {
    logPhotoComponent("NotificationListItem.tsx");
    logPhotoTrace({
      screen: "Notifications",
      component: "NotificationListItem.tsx",
      userId: null,
      portrait_url: null,
      main_photo_url: presentation.actorAvatarUrl,
      avatar_url: presentation.actorAvatarUrl,
      portraitDisplayResolved: avatarUrl,
      facePreviewSrc: avatarUrl ? "set" : "missing",
      finalImgSrc: avatarUrl,
    });
  }, [presentation.actorAvatarUrl, avatarUrl]);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99] ${
          unread
            ? "border-white/[0.1] bg-app-card shadow-[0_0_0_1px_rgba(255,30,45,0.08)]"
            : "border-app-border/50 bg-app-card/50 opacity-[0.9]"
        }`}
      >
        <div className="flex items-start gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/10"
              onLoad={(e) => {
                logPhotoTraceImgEvent(
                  "onLoad",
                  {
                    screen: "Notifications",
                    component: "NotificationListItem.tsx",
                    slot: "actor_avatar",
                    srcReceived: avatarUrl,
                  },
                  e.currentTarget,
                );
              }}
              onError={(e) => {
                logPhotoTraceImgEvent(
                  "onError",
                  {
                    screen: "Notifications",
                    component: "NotificationListItem.tsx",
                    slot: "actor_avatar",
                    srcReceived: avatarUrl,
                  },
                  e.currentTarget,
                );
              }}
            />
          ) : (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-bg text-lg ring-1 ring-white/10"
              aria-hidden
            >
              {presentation.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className={`text-[14px] leading-snug ${
                unread ? "font-semibold text-white" : "font-medium text-app-text/70"
              }`}
            >
              <span className="mr-1" aria-hidden>
                {presentation.emoji}
              </span>
              {presentation.line}
            </p>
            {presentation.subtitle ? (
              <p className="mt-0.5 text-[12px] leading-snug text-app-muted/80">{presentation.subtitle}</p>
            ) : null}
            {relativeTime ? (
              <p className="mt-1 text-[11px] text-app-muted/70">{relativeTime}</p>
            ) : null}
          </div>
          {unread ? (
            <span
              className="mt-2 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: NAV_BADGE_NOTIFICATION }}
              aria-hidden
            />
          ) : null}
        </div>
      </button>
    </li>
  );
}
