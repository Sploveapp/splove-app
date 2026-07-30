import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatBadge } from "../../lib/formatBadge";
import { resolveBottomNavActiveTab } from "../../lib/bottomNavActiveTab";
import { useTranslation } from "../../i18n/useTranslation";
import {
  useDiscoverUndoNavState,
  type DiscoverUndoNavState,
} from "../../contexts/DiscoverUndoNavContext";
import {
  SPLOVE_BOTTOM_NAV_LABEL_TO_SAFE_GAP_PX,
  SPLOVE_BOTTOM_NAV_PILL_HEIGHT_PX,
} from "../../constants/appBottomNavLayout";

const ACTIVE = "#FF3B3B";
const INACTIVE = "#6B6B76";
/**
 * Chrome flottant discret SPLove — fond presque opaque, blur faible.
 * La photo / le profil restent le focus ; la barre ne doit pas « crier » glass Instagram.
 */
const NAV_PILL_BG = "rgba(12, 12, 16, 0.86)";
const NAV_PILL_BORDER = "rgba(255, 255, 255, 0.06)";
const NAV_PILL_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.22)";
const NAV_PILL_BLUR_PX = 5;
/** Badges compteur : discret en production, rouge réservé à l’onglet actif */
const BADGE_BG = "rgba(255,59,59,0.16)";
const BADGE_TEXT = "#FCA5A5";
const UNDO_ACCENT = "#C77DFF";
const UNDO_BADGE_BG = "rgba(199,125,255,0.22)";
const UNDO_BADGE_TEXT = "#E9D4FF";
const UNDO_BADGE_BORDER = "rgba(199,125,255,0.45)";

/** Pictogrammes — alignés sur iOS `BottomNavigationBar` (icon 24 / label 10 / pilule 44). */
const ICON_PX = 24;
const STROKE = 1.65;
/** Hauteur pilule = constante unique (icônes / libellés inchangés). */
const PILL_HEIGHT_PX = SPLOVE_BOTTOM_NAV_PILL_HEIGHT_PX;
/** Gap libellés → safe area ; safe area appliquée une seule fois en padding-bottom. */
const LABEL_TO_SAFE_GAP_PX = SPLOVE_BOTTOM_NAV_LABEL_TO_SAFE_GAP_PX;
const NAV_PADDING_BOTTOM = `calc(${LABEL_TO_SAFE_GAP_PX}px + env(safe-area-inset-bottom, 0px))`;
/** Zone tactile Apple HIG (≥ 44×44). */
const ITEM_MIN_CLASS = "min-h-[44px] min-w-[44px]";
/** Libellé — taille + line-box fixes (parity iOS 10pt, anti-décalage métriques Android). */
const NAV_LABEL_CLASS =
  "flex h-[12px] max-w-full items-center justify-center truncate text-center text-[10px] font-medium leading-none tracking-tight transition-colors duration-150";

export type SPLoveBottomNavProps = {
  unreadMessagesCount: number;
  likesCount: number;
  profileNeedsAction: boolean;
  activityProposalsNeedAction?: boolean;
  onProfileTabClick: () => void;
};

export function SPLoveBottomNav({
  unreadMessagesCount,
  likesCount,
  profileNeedsAction,
  activityProposalsNeedAction = false,
  onProfileTabClick,
}: SPLoveBottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const discoverUndoNav = useDiscoverUndoNavState();

  // Onglet actif = pathname courant uniquement (jamais un state mémorisé).
  const activeTab = resolveBottomNavActiveTab(pathname);
  const isDiscover = activeTab === "move";
  const isMessages = activeTab === "messages";
  const isLikes = activeTab === "likes";
  const isProfile = activeTab === "profile";

  const msgBadgeShown = unreadMessagesCount > 0;
  const likesBadgeShown = likesCount > 0;

  const navLabel = t("nav_main_label");

  return (
    <nav
      id="splove-bottom-nav"
      className="pointer-events-none w-full"
      role="navigation"
      aria-label={navLabel}
      data-floating="true"
    >
      {/* Conteneur flottant : gap 10px + safe area une seule fois (pas de double inset). */}
      <div
        className="mx-auto w-full max-w-lg px-3"
        style={{
          paddingBottom: NAV_PADDING_BOTTOM,
          paddingTop: 0,
          boxSizing: "border-box",
        }}
      >
        <div
          className="pointer-events-auto flex w-full items-stretch justify-between gap-0.5 overflow-hidden rounded-[22px] border px-1.5 py-0"
          style={{
            height: PILL_HEIGHT_PX,
            background: NAV_PILL_BG,
            borderColor: NAV_PILL_BORDER,
            boxShadow: NAV_PILL_SHADOW,
            backdropFilter: `blur(${NAV_PILL_BLUR_PX}px)`,
            WebkitBackdropFilter: `blur(${NAV_PILL_BLUR_PX}px)`,
          }}
        >
          <BottomItem
            label={t("nav_tab_discover")}
            ariaLabel={t("nav_tab_discover")}
            active={isDiscover}
            icon={(c) => <DiscoverIcon color={c} />}
            onActivate={() => navigate("/move")}
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
              profileNeedsAction
                ? `${t("nav_tab_profile")}, ${t("nav_profile_action_aria")}`
                : activityProposalsNeedAction
                  ? `${t("nav_tab_profile")}, ${t("to_confirm")}`
                  : t("nav_tab_profile")
            }
            active={isProfile}
            icon={(c) => <ProfileIcon color={c} />}
            indicator={profileNeedsAction || activityProposalsNeedAction}
            onActivate={() => {
              console.log("[REAL_PROFILE_CLICK]", {
                currentPath: pathname,
                targetPath: "/profile",
                activityProposalsNeedAction,
                handler: "SPLoveBottomNav.profileTab",
              });
              onProfileTabClick();
            }}
          />
        </div>
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
  const highlighted = undo.undoAvailable && !undo.undoBusy;
  const tappable = undo.undoNavTapEnabled && !undo.undoBusy;
  const stroke = highlighted ? UNDO_ACCENT : INACTIVE;
  const labelColor = highlighted ? UNDO_ACCENT : INACTIVE;
  const badge = undo.undoBadgeText?.trim();

  const ariaBusy = undo.undoBusy;
  let ariaLabel = label;
  if (badge) ariaLabel = `${label}, ${badge}`;

  return (
    <button
      type="button"
      disabled={undo.undoBusy || !undo.undoNavTapEnabled}
      style={{
        WebkitTapHighlightColor: "transparent",
        background: "transparent",
        border: "none",
        cursor: tappable ? "pointer" : "not-allowed",
        opacity: undo.undoBusy ? 0.65 : undo.undoNavTapEnabled ? 1 : 0.45,
        color: labelColor,
      }}
      aria-label={ariaLabel}
      aria-busy={ariaBusy ? "true" : undefined}
      className={`flex ${ITEM_MIN_CLASS} min-w-0 flex-1 flex-col items-center justify-center gap-0 px-0.5 py-0 transition-[transform,opacity] duration-150 ease-out active:scale-[0.94] disabled:active:scale-100 [&:focus-visible]:outline [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-[-2px] [&:focus-visible]:outline-[#C77DFF]/35`}
      onClick={() => {
        undo.triggerUndo();
      }}
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
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
      <span className={NAV_LABEL_CLASS} style={{ color: labelColor }}>
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
      className={`flex ${ITEM_MIN_CLASS} min-w-0 flex-1 flex-col items-center justify-center gap-0 px-0.5 py-0 transition-[transform,color] duration-150 ease-out active:scale-[0.94] [&:focus-visible]:outline [&:focus-visible]:outline-2 [&:focus-visible]:outline-offset-[-2px] [&:focus-visible]:outline-white/30`}
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
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
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
            className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[rgba(20,20,25,0.9)]"
            style={{
              backgroundColor: ACTIVE,
              boxShadow: `0 0 0 1px rgba(255,59,59,0.45)`,
            }}
          />
        ) : null}
      </span>
      <span className={NAV_LABEL_CLASS} style={{ color: labelColor }}>
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
