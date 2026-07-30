import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { APP_BG } from "../constants/theme";
import { GlobalHeader } from "./GlobalHeader";
import { SPLoveBottomNav } from "./navigation/SPLoveBottomNav";
import { DiscoverUndoNavProvider } from "../contexts/DiscoverUndoNavContext";
import { useAuth } from "../contexts/AuthContext";
import { fetchIncomingNonBlockedLikesCount } from "../services/likes.service";
import {
  ACTIVITY_PROPOSALS_REFRESH_EVENT,
  INBOX_REFRESH_EVENT,
  IN_APP_NOTIFICATIONS_REFRESH_EVENT,
} from "../constants";
import { fetchActivityProposalsPendingActionCount } from "../lib/activityProposalPendingAction";
import { CHAT_MESSAGES_TABLE, supabase } from "../lib/supabase";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";
import { deferSecondaryWork } from "../lib/deferSecondaryWork";
import { runPostLoginOptionalBatch } from "../lib/postLoginPerf";
import {
  countUnreadInAppNotifications,
  pulseInAppNotifications,
  refreshInAppNotificationBadge,
} from "../services/inAppNotifications.service";
import { syncNativeIconBadge } from "../lib/pushBadgeSync";
import {
  SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK,
  SPLOVE_BOTTOM_NAV_HEIGHT_VAR,
} from "../constants/appBottomNavLayout";
import { matchActiveMessages } from "../lib/bottomNavActiveTab";
import {
  CHAT_KEYBOARD_SHELL_EVENT,
  isChatConversationKeyboardOpen,
} from "../lib/chatConversationKeyboardShell";
import { usesNativeBottomNavigation } from "../lib/nativeBottomNav";

const USER_PROFILE_PATH = "/profile";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isProfileComplete, isProfileLoading, user } = useAuth();
  const [inboxCount, setInboxCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [inAppUnread, setInAppUnread] = useState(0);
  const [activityPendingCount, setActivityPendingCount] = useState(0);
  const isChat = location.pathname.startsWith("/chat/");
  /** Agenda autonome : pas de bandeau global ; fond clair sur tout le shell (évite l’encadrement sombre type Discover). */
  const isMesRencontres = /^\/mes-rencontres\/?$/.test(location.pathname);

  const pulseAppNotifications = useCallback(async () => {
    const uid = user?.id;
    await pulseInAppNotifications(uid);
    const n = await countUnreadInAppNotifications();
    setInAppUnread(n);
    if (uid) void syncNativeIconBadge(uid);
  }, [user?.id]);

  const refreshAppNotificationBadge = useCallback(async () => {
    const uid = user?.id;
    const n = await refreshInAppNotificationBadge(uid);
    setInAppUnread(n);
  }, [user?.id]);

  const loadLikesBadgeCount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setLikesCount(0);
      return;
    }
    const n = await fetchIncomingNonBlockedLikesCount(user.id);
    setLikesCount(n);
  }, []);

  const loadActivityPendingCount = useCallback(async () => {
    const uid = user?.id;
    if (!uid) {
      setActivityPendingCount(0);
      return;
    }
    const n = await fetchActivityProposalsPendingActionCount(uid);
    setActivityPendingCount(n);
  }, [user?.id]);

  const loadInboxCount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setInboxCount(0);
      return;
    }
    const blocked = await fetchBlockedRelatedUserIds();
    const { data: matches } = await supabase
      .from("matches")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const filtered = (matches ?? []).filter((m: { user_a: string; user_b: string }) => {
      const other = m.user_a === user.id ? m.user_b : m.user_a;
      return !blocked.has(other);
    });
    const matchIds = filtered.map((m: { id: string }) => m.id);
    if (matchIds.length === 0) {
      setInboxCount(0);
      return;
    }
    const { data: convs } = await supabase.from("conversations").select("id").in("match_id", matchIds);
    const convIds = (convs ?? []).map((c: { id: string }) => c.id);
    if (convIds.length === 0) {
      setInboxCount(0);
      return;
    }
    const { data: unreadRows, error } = await supabase
      .from(CHAT_MESSAGES_TABLE)
      .select("conversation_id")
      .in("conversation_id", convIds)
      .neq("sender_id", user.id)
      .is("read_at", null);
    if (error) {
      console.warn("[AppLayout] inbox unread query", error);
      setInboxCount(0);
      return;
    }
    const distinct = new Set(
      (unreadRows ?? []).map((r: { conversation_id: string }) => r.conversation_id),
    );
    setInboxCount(distinct.size);
    if (user?.id) void syncNativeIconBadge(user.id);
  }, [user?.id]);

  useEffect(() => {
    return deferSecondaryWork(() => {
      void loadInboxCount();
      void loadLikesBadgeCount();
      void loadActivityPendingCount();
    }, 3_500);
  }, [location.pathname, loadInboxCount, loadLikesBadgeCount, loadActivityPendingCount]);

  useEffect(() => {
    const onRefresh = () => {
      void loadInboxCount();
      void loadLikesBadgeCount();
    };
    window.addEventListener(INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, onRefresh);
  }, [loadInboxCount, loadLikesBadgeCount]);

  useEffect(() => {
    const onRefresh = () => {
      void loadActivityPendingCount();
    };
    window.addEventListener(ACTIVITY_PROPOSALS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ACTIVITY_PROPOSALS_REFRESH_EVENT, onRefresh);
  }, [loadActivityPendingCount]);

  useEffect(() => {
    return deferSecondaryWork(() => {
      void runPostLoginOptionalBatch("app-layout-notifications", async () => {
        await pulseAppNotifications();
      });
    }, 3_500);
  }, [location.pathname, pulseAppNotifications]);

  useEffect(() => {
    let intervalId: number | undefined;
    const cancelDefer = deferSecondaryWork(() => {
      intervalId = window.setInterval(() => {
        void pulseAppNotifications();
      }, 120_000);
    }, 1500);
    return () => {
      cancelDefer();
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [pulseAppNotifications]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void pulseAppNotifications();
      }
    };
    const cancelDefer = deferSecondaryWork(() => {
      document.addEventListener("visibilitychange", onVis);
    }, 1500);
    return () => {
      cancelDefer();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pulseAppNotifications]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshAppNotificationBadge();
    };
    const cancelDefer = deferSecondaryWork(() => {
      window.addEventListener(IN_APP_NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    }, 1500);
    return () => {
      cancelDefer();
      window.removeEventListener(IN_APP_NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [refreshAppNotificationBadge]);

  const inboxRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const notifRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const bottomNavMeasureRef = useRef<HTMLDivElement | null>(null);

  const [chatKeyboardOpen, setChatKeyboardOpen] = useState(isChatConversationKeyboardOpen);

  useEffect(() => {
    const sync = () => setChatKeyboardOpen(isChatConversationKeyboardOpen());
    window.addEventListener(CHAT_KEYBOARD_SHELL_EVENT, sync);
    return () => window.removeEventListener(CHAT_KEYBOARD_SHELL_EVENT, sync);
  }, []);

  useEffect(() => {
    const el = bottomNavMeasureRef.current;
    if (!el) return;

    const syncNavHeight = () => {
      if (isChat && isChatConversationKeyboardOpen()) {
        document.documentElement.style.setProperty(SPLOVE_BOTTOM_NAV_HEIGHT_VAR, "0px");
        return;
      }
      // Overlap glass réservé à Move — Messages/Chat : clearance pleine (composer jamais sous la barre).
      const overlapPx = matchActiveMessages(location.pathname) ? 0 : 12;
      // Hauteur mesurée du conteneur fixed (pilule + gap + safe area) − overlap éventuel.
      const measured = Math.max(0, el.offsetHeight - overlapPx);
      document.documentElement.style.setProperty(
        SPLOVE_BOTTOM_NAV_HEIGHT_VAR,
        `${measured}px`,
      );
    };

    syncNavHeight();
    const ro = new ResizeObserver(syncNavHeight);
    ro.observe(el);
    window.addEventListener(CHAT_KEYBOARD_SHELL_EVENT, syncNavHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener(CHAT_KEYBOARD_SHELL_EVENT, syncNavHeight);
      document.documentElement.style.removeProperty(SPLOVE_BOTTOM_NAV_HEIGHT_VAR);
    };
  }, [isChat, location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const cancelDefer = deferSecondaryWork(() => {
      void (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const ch = supabase
          .channel(`inbox-messages:${user.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: CHAT_MESSAGES_TABLE },
            () => {
              void loadInboxCount();
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: CHAT_MESSAGES_TABLE },
            () => {
              void loadInboxCount();
            },
          )
          .subscribe();
        if (cancelled) {
          void supabase.removeChannel(ch);
          return;
        }
        inboxRealtimeChannelRef.current = ch;
      })();
    }, 2000);

    return () => {
      cancelled = true;
      cancelDefer();
      const ch = inboxRealtimeChannelRef.current;
      inboxRealtimeChannelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [loadInboxCount]);

  useEffect(() => {
    let cancelled = false;
    const cancelDefer = deferSecondaryWork(() => {
      void (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;

        const ch = supabase
          .channel(`in-app-notifications:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "in_app_notifications",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              void pulseAppNotifications();
            },
          )
          .subscribe();

        if (cancelled) {
          void supabase.removeChannel(ch);
          return;
        }
        notifRealtimeChannelRef.current = ch;
      })();
    }, 2000);

    return () => {
      cancelled = true;
      cancelDefer();
      const ch = notifRealtimeChannelRef.current;
      notifRealtimeChannelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [pulseAppNotifications]);

  const shellBg = isMesRencontres ? "#F4F6F8" : APP_BG;
  const nativeBottomNav = usesNativeBottomNavigation();
  const hideWebBottomNav = isChat && chatKeyboardOpen;

  const handleProfileTabClick = useCallback(() => {
    const currentPath = location.pathname;
    const targetPath = USER_PROFILE_PATH;
    console.log("[REAL_PROFILE_CLICK]", {
      currentPath,
      targetPath,
      activityPendingCount,
      activityProposalsNeedAction: activityPendingCount > 0,
      handler: "AppLayout.handleProfileTabClick",
    });
    const leavingMeetups =
      currentPath === "/mes-rencontres" || currentPath.startsWith("/mes-rencontres/");
    navigate(targetPath, { replace: leavingMeetups });
  }, [activityPendingCount, location.pathname, navigate]);

  return (
    <DiscoverUndoNavProvider>
      <div
        className="splove-app-shell"
        style={
          {
            background: shellBg,
            [SPLOVE_BOTTOM_NAV_HEIGHT_VAR]: nativeBottomNav
              ? // iOS : la safeAreaInset native réserve déjà la barre.
                // Slack ~12px uniquement → léger scroll comme Android (overlap glass),
                // sans doubler la clearance (sinon grand vide + bas de carte masqué).
                "12px"
              : SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK,
          } as CSSProperties
        }
      >
        {!isChat && !isMesRencontres ? <GlobalHeader inAppUnreadCount={inAppUnread} /> : null}

        <div
          className={
            nativeBottomNav ? "splove-app-shell__main splove-app-shell__main--native-nav" : "splove-app-shell__main"
          }
        >
          <Outlet />
        </div>

        {!nativeBottomNav ? (
          <div
            ref={bottomNavMeasureRef}
            className="splove-app-shell__bottom-nav transition-[opacity,transform] duration-200 ease-out"
            style={{
              opacity: hideWebBottomNav ? 0 : 1,
              transform: hideWebBottomNav ? "translateY(calc(100% + 8px))" : "translateY(0)",
              pointerEvents: hideWebBottomNav ? "none" : undefined,
            }}
          >
            <SPLoveBottomNav
              unreadMessagesCount={inboxCount}
              likesCount={likesCount}
              profileNeedsAction={!isProfileLoading && !isProfileComplete}
              activityProposalsNeedAction={activityPendingCount > 0}
              onProfileTabClick={handleProfileTabClick}
            />
          </div>
        ) : null}
      </div>
    </DiscoverUndoNavProvider>
  );
}
