import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, HeartHandshake, MessageCircle, UserRound } from "lucide-react";
import { SPLove_BOTTOM_NAV_BG } from "../../constants/theme";
import { formatBadge } from "../../lib/formatBadge";
import { useTranslation } from "../../i18n/useTranslation";

const ACTIVE = "#E11D2E";
const ICON_INACTIVE = "rgba(255, 255, 255, 0.52)";
const LABEL_ACTIVE = "#FFFFFF";
const LABEL_INACTIVE = "#A1A1AA";

const ICON_PX = 22;
const STROKE = 1.5;

export type SPLoveBottomNavProps = {
  activeRoute: string;
  unreadMessagesCount: number;
  likesCount: number;
  profileNeedsAction: boolean;
};

function matchActiveDiscover(pathname: string): boolean {
  return pathname === "/" || pathname === "/discover";
}

function matchActiveMessages(pathname: string): boolean {
  return pathname === "/messages" || pathname.startsWith("/chat/");
}

function matchActiveLikes(pathname: string): boolean {
  return pathname === "/likes-you" || pathname === "/likes";
}

function matchActiveProfile(pathname: string): boolean {
  return pathname === "/profile" || pathname.startsWith("/profile/");
}

export function SPLoveBottomNav({
  activeRoute,
  unreadMessagesCount,
  likesCount,
  profileNeedsAction,
}: SPLoveBottomNavProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const path = activeRoute;

  const isDiscover = matchActiveDiscover(path);
  const isMessages = matchActiveMessages(path);
  const isLikes = matchActiveLikes(path);
  const isProfile = matchActiveProfile(path);

  const msgBadgeShown = unreadMessagesCount > 0;
  const likesBadgeShown = likesCount > 0;

  const navLabel = t("nav_main_label");

  return (
    <nav
      className="w-full border-t border-white/[0.08]"
      style={{ backgroundColor: SPLove_BOTTOM_NAV_BG }}
      role="navigation"
      aria-label={navLabel}
    >
      <div
        className="mx-auto flex w-full max-w-lg items-stretch justify-between gap-1 px-1"
        style={{
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          paddingTop: 8,
          boxSizing: "border-box",
        }}
      >
        <BottomItem
          label={t("nav_tab_discover")}
          ariaLabel={t("nav_tab_discover")}
          active={isDiscover}
          icon={(c) => <Heart aria-hidden absoluteStrokeWidth size={ICON_PX} strokeWidth={STROKE} color={c} />}
          onActivate={() => navigate("/discover")}
        />
        <BottomItem
          label={t("messages_title")}
          ariaLabel={
            unreadMessagesCount <= 0
              ? t("messages_title")
              : unreadMessagesCount > 9
                ? `${t("messages_title")}, 9+`
                : `${t("messages_title")}, ${unreadMessagesCount}`
          }
          active={isMessages}
          badge={msgBadgeShown ? formatBadge(unreadMessagesCount) : null}
          icon={(c) => (
            <MessageCircle aria-hidden absoluteStrokeWidth size={ICON_PX} strokeWidth={STROKE} color={c} />
          )}
          onActivate={() => navigate("/messages")}
        />
        <BottomItem
          label={t("nav_tab_likes")}
          ariaLabel={t("nav_tab_likes")}
          active={isLikes}
          badge={likesBadgeShown ? formatBadge(likesCount) : null}
          icon={(c) => (
            <HeartHandshake aria-hidden absoluteStrokeWidth size={ICON_PX} strokeWidth={STROKE} color={c} />
          )}
          onActivate={() => navigate("/likes-you")}
        />
        <BottomItem
          label={t("nav_tab_profile")}
          ariaLabel={
            profileNeedsAction ? `${t("nav_tab_profile")}, ${t("nav_profile_action_aria")}` : t("nav_tab_profile")
          }
          active={isProfile}
          icon={(c) => (
            <UserRound aria-hidden absoluteStrokeWidth size={ICON_PX} strokeWidth={STROKE} color={c} />
          )}
          indicator={profileNeedsAction}
          onActivate={() => navigate("/profile")}
        />
      </div>
    </nav>
  );
}

type BottomItemProps = {
  label: string;
  ariaLabel: string;
  active: boolean;
  icon: (color: string) => ReactNode;
  badge?: string | null;
  indicator?: boolean;
  onActivate: () => void;
};

function BottomItem({
  label,
  ariaLabel,
  active,
  icon,
  badge = null,
  indicator = false,
  onActivate,
}: BottomItemProps) {
  const stroke = active ? ACTIVE : ICON_INACTIVE;
  const labelColor = active ? LABEL_ACTIVE : LABEL_INACTIVE;

  return (
    <button
      type="button"
      className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-0.5 [&:focus-visible]:outline [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-[-2px] [&:focus-visible]:outline-white/30"
      style={{
        WebkitTapHighlightColor: "transparent",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: labelColor,
      }}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      onClick={onActivate}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center pb-1">
        <span aria-hidden>{icon(stroke)}</span>
        {active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: ACTIVE }}
          />
        ) : null}
        {badge ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[5px] text-[10px] font-semibold leading-none text-white"
            style={{ backgroundColor: ACTIVE }}
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
        {!badge && indicator ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
            style={{
              backgroundColor: ACTIVE,
              boxShadow: `0 0 0 2px ${SPLove_BOTTOM_NAV_BG}`,
            }}
          />
        ) : null}
      </span>
      <span
        className="max-w-full truncate text-center text-[11px] font-medium tracking-tight"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </button>
  );
}
