import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { NAV_ICON_HOVER } from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";
import { HeaderNotificationButton } from "./HeaderNotificationButton";

type GlobalHeaderProps = {
  /** En-tête plus bas pour parcours longs (ex. onboarding). */
  variant?: "default" | "compact";
  /** Badge notifications in-app (Discover shell). */
  inAppUnreadCount?: number;
};

/**
 * En-tête global : marque + déconnexion ; onglets Découvrir / SPLove+ sur les routes concernées.
 */
export function GlobalHeader({ variant = "default", inAppUnreadCount = 0 }: GlobalHeaderProps) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const location = useLocation();
  const compact = variant === "compact";

  const showPrimaryNav =
    !compact &&
    (location.pathname === "/discover" || location.pathname === "/splove-plus");

  const isDiscover = location.pathname === "/discover";
  const isSplovePlus = location.pathname === "/splove-plus";

  async function handleLogout() {
    await signOut();
  }

  return (
    <header
      className={`sticky top-0 z-30 w-full border-b border-app-border/30 bg-app-bg/95 backdrop-blur-md ${
        compact ? "px-4 py-1.5" : showPrimaryNav ? "px-4 pb-2.5 pt-3" : "px-6 py-3"
      }`}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-1">
        {/* Niveau 1 — marque */}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              aria-hidden
              className={
                compact
                  ? "h-auto max-w-[40px] shrink-0 object-contain"
                  : "h-9 w-auto max-w-[100px] shrink-0 object-contain"
              }
            />
            <span
              className={`truncate font-semibold tracking-tight ${compact ? "text-[17px]" : "text-[18px] text-app-text"}`}
              style={{ color: compact ? NAV_ICON_HOVER : undefined }}
            >
              SPLove
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <HeaderNotificationButton hasNotification={inAppUnreadCount > 0} />
            <button
              type="button"
              onClick={() => void handleLogout()}
              aria-label={t("auth.logout")}
              className={`shrink-0 rounded-lg font-medium text-app-muted transition-colors hover:bg-white/[0.04] hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25 ${
                compact ? "px-2 py-1 text-[11px]" : "px-2 py-1.5 text-[11px]"
              }`}
            >
              {t("auth.logout")}
            </button>
          </div>
        </div>

        {/* Niveau 2 — navigation (Découvrir / SPLove+) */}
        {showPrimaryNav ? (
          <nav
            className="flex w-full items-stretch gap-8 pt-1"
            aria-label={`${t("discover_profiles")} / ${t("premium_title")}`}
          >
            <Link
              to="/discover"
              className={`min-w-0 flex-1 pb-2.5 pt-1 text-center text-[13px] font-semibold tracking-tight transition-[color,border-color] ${
                isDiscover
                  ? "border-b-2 border-app-text text-app-text"
                  : "border-b-2 border-transparent text-app-muted hover:text-app-text/90"
              }`}
            >
              {t("discover_profiles")}
            </Link>
            <Link
              to="/splove-plus"
              className={`min-w-0 flex-1 pb-2.5 pt-1 text-center text-[13px] font-semibold tracking-tight transition-[color,border-color] ${
                isSplovePlus
                  ? "border-b-2 border-app-text text-app-text"
                  : "border-b-2 border-transparent text-app-muted hover:text-app-text/90"
              }`}
            >
              SPLove+
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
