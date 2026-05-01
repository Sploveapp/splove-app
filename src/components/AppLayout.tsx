import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { APP_BG } from "../constants/theme";
import { GlobalHeader } from "./GlobalHeader";
import { SPLoveBottomNav } from "./navigation/SPLoveBottomNav";
import { useAuth } from "../contexts/AuthContext";
import { fetchIncomingNonBlockedLikesCount } from "../services/likes.service";
import { INBOX_REFRESH_EVENT } from "../constants";
import { CHAT_MESSAGES_TABLE, supabase } from "../lib/supabase";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";
import { pulseInAppNotifications } from "../services/inAppNotifications.service";

export function AppLayout() {
  console.log("[AppLayout] render");
  const location = useLocation();
  const { isProfileComplete, isProfileLoading } = useAuth();
  const [inboxCount, setInboxCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [inAppUnread, setInAppUnread] = useState(0);
  const isChat = location.pathname.startsWith("/chat/");
  /** Agenda autonome : pas de bandeau global ; fond clair sur tout le shell (évite l’encadrement sombre type Discover). */
  const isMesRencontres = /^\/mes-rencontres\/?$/.test(location.pathname);

  const pulseAppNotifications = useCallback(async () => {
    const n = await pulseInAppNotifications();
    setInAppUnread(n);
  }, []);

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
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadInboxCount();
      if (cancelled) return;
      await loadLikesBadgeCount();
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, loadInboxCount, loadLikesBadgeCount]);

  useEffect(() => {
    const onRefresh = () => {
      void loadInboxCount();
      void loadLikesBadgeCount();
    };
    window.addEventListener(INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, onRefresh);
  }, [loadInboxCount, loadLikesBadgeCount]);

  useEffect(() => {
    void pulseAppNotifications();
  }, [location.pathname, pulseAppNotifications]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pulseAppNotifications();
    }, 120_000);
    return () => clearInterval(id);
  }, [pulseAppNotifications]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void pulseAppNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pulseAppNotifications]);

  const inboxRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
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

    return () => {
      cancelled = true;
      const ch = inboxRealtimeChannelRef.current;
      inboxRealtimeChannelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [loadInboxCount]);

  const shellBg = isMesRencontres ? "#F4F6F8" : APP_BG;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: shellBg,
      }}
    >
      {!isChat && !isMesRencontres ? <GlobalHeader inAppUnreadCount={inAppUnread} /> : null}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </div>

      <div style={{ flexShrink: 0 }}>
        <SPLoveBottomNav
          activeRoute={location.pathname}
          unreadMessagesCount={inboxCount}
          likesCount={likesCount}
          profileNeedsAction={!isProfileLoading && !isProfileComplete}
        />
      </div>
    </div>
  );
}
