import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { APP_BG, NAV_BAR_BG } from "../constants/theme";
import { GlobalHeader } from "./GlobalHeader";
import { BottomNav } from "./BottomNav";
import { supabase } from "../lib/supabase";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";

export function AppLayout() {
  console.log("[AppLayout] render");
  const location = useLocation();
  const [inboxCount, setInboxCount] = useState(0);
  const isChat = location.pathname.startsWith("/chat/");

  useEffect(() => {
    let cancelled = false;
    async function loadInboxCount() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const blocked = await fetchBlockedRelatedUserIds();
      const { data: matches } = await supabase
        .from("matches")
        .select("id, user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      const filtered = (matches ?? []).filter((m: { user_a: string; user_b: string }) => {
        const other = m.user_a === user.id ? m.user_b : m.user_a;
        return !blocked.has(other);
      });
      const ids = filtered.map((m: { id: string }) => m.id);
      if (ids.length === 0) {
        if (!cancelled) setInboxCount(0);
        return;
      }
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .in("match_id", ids);
      if (!cancelled) setInboxCount(count ?? 0);
    }
    void loadInboxCount();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: APP_BG,
      }}
    >
      {!isChat ? <GlobalHeader /> : null}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </div>

      <div style={{ background: NAV_BAR_BG, flexShrink: 0 }}>
        <BottomNav inboxCount={inboxCount} />
      </div>
    </div>
  );
}
