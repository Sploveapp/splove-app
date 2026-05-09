import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { formatBadge } from "../../lib/formatBadge";
import { useTranslation } from "../../i18n/useTranslation";
import {
  useDiscoverUndoNavState,
  type DiscoverUndoNavState,
} from "../../contexts/DiscoverUndoNavContext";

const ACTIVE = "#FF3B3B";
const INACTIVE = "#6B6B76";
const NAV_BACKGROUND = "#0B0B0F";
const NAV_BORDER_TOP = "rgba(255,255,255,0.08)";
/** Badges compteur : discret en production, rouge réservé à l’onglet actif */
const BADGE_BG = "rgba(255,59,59,0.16)";
const BADGE_TEXT = "#FCA5A5";
const UNDO_ACCENT = "#C77DFF";
const UNDO_BADGE_BG = "rgba(199,125,255,0.22)";
const UNDO_BADGE_TEXT = "#E9D4FF";
const UNDO_BADGE_BORDER = "rgba(199,125,255,0.45)";

const ICON_PX = 24;
const STROKE = 1.65;

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

function matchActiveEncounters(pathname: string): boolean {
  return pathname === "/mes-rencontres" || pathname.startsWith("/match/");
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
  const discoverUndoNav = useDiscoverUndoNavState();

  const isDiscover = matchActiveDiscover(path);
  const isMessages = matchActiveMessages(path);
  const isLikes = matchActiveLikes(path);
  const isProfile = matchActiveProfile(path);
  const isEncounters = matchActiveEncounters(path);

  const msgBadgeShown = unreadMessagesCount > 0;
  const likesBadgeShown = likesCount > 0;

  const navLabel = t("nav_main_label");

  return (
    <nav
      className="w-full border-t"
      style={{ backgroundColor: NAV_BACKGROUND, borderTopColor: NAV_BORDER_TOP }}
      role="navigation"
      aria-label={navLabel}
    >
      <div
        className="mx-auto flex w-full max-w-lg items-stretch justify-between gap-1 px-1.5"
        style={{
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          paddingTop: 10,
          boxSizing: "border-box",
        }}
      >
        <BottomItem
          label={t("nav_tab_discover")}
          ariaLabel={t("nav_tab_discover")}
          active={isDiscover}
          icon={(c) => <DiscoverIcon color={c} />}
          onActivate={() => navigate("/discover")}
        />
        <UndoBottomItem undo={discoverUndoNav} label={t("nav_tab_undo")} />
        <BottomItem
          label={t("nav_tab_likes")}
          ariaLabel={
            likesCount <= 0
              ? t("nav_tab_likes")
              : likesCount > 9
                ? `${t("nav_tab_likes")}, 9+`
                : `${t("nav_tab_likes")}, ${likesCount}`
          }
          active={isLikes}
          badge={likesBadgeShown ? formatBadge(likesCount) : null}
          icon={(c) => <PulsesIcon color={c} />}
          onActivate={() => navigate("/likes-you")}
        />
        <BottomItem
          label={t("nav_tab_encounters")}
          ariaLabel={t("nav_tab_encounters")}
          active={isEncounters}
          icon={(c) => <EncountersIcon color={c} />}
          onActivate={() => navigate("/mes-rencontres")}
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
          icon={(c) => <MessagesIcon color={c} />}
          onActivate={() => navigate("/messages")}
        />
        <BottomItem
          label={t("nav_tab_profile")}
          ariaLabel={
            profileNeedsAction ? `${t("nav_tab_profile")}, ${t("nav_profile_action_aria")}` : t("nav_tab_profile")
          }
          active={isProfile}
          icon={(c) => <ProfileIcon color={c} />}
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

function UndoRewindIcon({ color }: { color: string }) {
  return (
    <svg aria-hidden width={ICON_PX} height={ICON_PX} viewBox="0 0 24 24" fill="none">
      <path
        d="M17.95 17.42A7.4 7.4 0 0 1 7.6 7.16 7.4 7.4 0 0 1 14.4 3.4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d="M15.2 3.15h3.9v3.9"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoBottomItem({
  undo,
  label,
}: {
  undo: DiscoverUndoNavState;
  label: string;
}) {
  const enabled = undo.undoAvailable && !undo.undoBusy;
  const stroke = enabled ? UNDO_ACCENT : INACTIVE;
  const labelColor = enabled ? UNDO_ACCENT : INACTIVE;
  const badge = undo.undoBadgeText?.trim();

  const ariaBusy = undo.undoBusy;
  let ariaLabel = label;
  if (badge) ariaLabel = `${label}, ${badge}`;

  return (
    <button
      type="button"
      disabled={!undo.undoAvailable || undo.undoBusy}
      style={{
        WebkitTapHighlightColor: "transparent",
        background: "transparent",
        border: "none",
        cursor: enabled && !undo.undoBusy ? "pointer" : "not-allowed",
        opacity: undo.undoBusy ? 0.65 : undo.undoAvailable ? 1 : 0.45,
        color: labelColor,
      }}
      aria-label={ariaLabel}
      aria-busy={ariaBusy ? "true" : undefined}
      className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 transition-[transform,opacity] duration-150 ease-out active:scale-[0.94] disabled:active:scale-100 [&:focus-visible]:outline [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-[-2px] [&:focus-visible]:outline-[#C77DFF]/35"
      onClick={() => {
        undo.triggerUndo();
      }}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center pb-1">
        <UndoRewindIcon color={stroke} />
        {badge ? (
          <span
            className="pointer-events-none absolute -right-1 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-none"
            style={{
              backgroundColor: UNDO_BADGE_BG,
              borderColor: UNDO_BADGE_BORDER,
              color: UNDO_BADGE_TEXT,
            }}
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </span>
      <span
        className="max-w-full truncate text-center text-[11px] font-medium tracking-tight transition-colors duration-150"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </button>
  );
}

function BottomItem({
  label,
  ariaLabel,
  active,
  icon,
  badge = null,
  indicator = false,
  onActivate,
}: BottomItemProps) {
  const stroke = active ? ACTIVE : INACTIVE;
  const labelColor = active ? ACTIVE : INACTIVE;

  return (
    <button
      type="button"
      className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 transition-[transform,color] duration-150 ease-out active:scale-[0.94] [&:focus-visible]:outline [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-[-2px] [&:focus-visible]:outline-white/30"
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
        {badge ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border px-[5px] text-[10px] font-semibold leading-none"
            style={{
              backgroundColor: BADGE_BG,
              borderColor: "rgba(255,59,59,0.35)",
              color: BADGE_TEXT,
            }}
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
        {!badge && indicator ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[#0B0B0F]"
            style={{
              backgroundColor: ACTIVE,
              boxShadow: `0 0 0 1px rgba(255,59,59,0.45)`,
            }}
          />
        ) : null}
      </span>
      <span
        className="max-w-full truncate text-center text-[11px] font-medium tracking-tight transition-colors duration-150"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </button>
  );
}

function IconFrame({ children, color }: { children: ReactNode; color: string }) {
  return (
    <svg
      aria-hidden
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function DiscoverIcon({ color }: { color: string }) {
  return (
    <IconFrame color={color}>
      <path d="M12 20.2c-3-2.25-5.6-4.45-5.6-7.2A3.1 3.1 0 0 1 9.6 9.8c1 0 1.8.45 2.4 1.15.6-.7 1.4-1.15 2.4-1.15A3.1 3.1 0 0 1 17.6 13c0 2.75-2.6 4.95-5.6 7.2Z" />
      <circle cx="12" cy="12" r="8.2" />
      <path d="M18.3 5.7 20.6 3.4" />
    </IconFrame>
  );
}

function PulsesIcon({ color }: { color: string }) {
  return (
    <IconFrame color={color}>
      <path d="M12 20.2c-3-2.25-5.6-4.45-5.6-7.2A3.1 3.1 0 0 1 9.6 9.8c1 0 1.8.45 2.4 1.15.6-.7 1.4-1.15 2.4-1.15A3.1 3.1 0 0 1 17.6 13c0 2.75-2.6 4.95-5.6 7.2Z" />
      <path d="M5 12h2.3l1.4-2.3 2.1 4.8 1.7-3.1H15l1.1-1.7L19 12h0" />
    </IconFrame>
  );
}

function EncountersIcon({ color }: { color: string }) {
  return (
    <IconFrame color={color}>
      <rect x="4.5" y="6.5" width="15" height="13" rx="2.5" />
      <path d="M8 4.8v3.2M16 4.8v3.2M4.5 10h15" />
      <path d="M15.5 15.8 17.2 14l-1.15-.05.55-1.2-1.65 1.8 1.1.05Z" />
    </IconFrame>
  );
}

function MessagesIcon({ color }: { color: string }) {
  return (
    <IconFrame color={color}>
      <path d="M5.5 6.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H12l-3.5 2.5v-2.5H5.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <path d="M9 12h1.7l.8-1.3 1.2 2.3 1-1.6H16" />
    </IconFrame>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <IconFrame color={color}>
      <circle cx="12" cy="8.2" r="2.9" />
      <path d="M6.2 18.1c.7-2.3 2.9-3.8 5.8-3.8 2.9 0 5.1 1.5 5.8 3.8" />
      <path d="M6.4 9.5c-.7 2.1-.5 4.2.7 6" />
    </IconFrame>
  );
}
