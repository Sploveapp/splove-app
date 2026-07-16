import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, type NavigateFunction } from "react-router-dom";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";
import { fetchUnreadCountByConversation } from "../services/inboxUnread.service";
import { useTranslation } from "../i18n/useTranslation";
import { ReferralEmptyState } from "../components/referral/ReferralEmptyState";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { INBOX_REFRESH_EVENT } from "../constants";
import { countPendingSecondChancesForUser } from "../services/secondChance.service";
import { formatBadge } from "../lib/formatBadge";
import { logPhotoComponent, logPhotoTrace, logPhotoTraceImgEvent } from "../lib/photoTraceLog";

type InboxRow = {
  conversationId: string;
  matchId: string;
  otherUserId: string;
  otherName: string | null;
  otherPhoto: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unreadCount: number;
};

function MessageThreadRowItem(props: {
  row: InboxRow;
  t: (k: string) => string;
  navigate: NavigateFunction;
}) {
  const { row, t, navigate } = props;
  const otherPhotoDisplay = useProfilePhotoSignedUrl(row.otherPhoto);
  const hasUnread = row.unreadCount > 0;

  useEffect(() => {
    logPhotoComponent("Messages.tsx/MessageThreadRowItem");
    logPhotoTrace({
      screen: "Messages",
      component: "Messages.tsx/MessageThreadRowItem",
      userId: row.otherUserId,
      portrait_url: null,
      main_photo_url: row.otherPhoto,
      avatar_url: null,
      portraitDisplayResolved: otherPhotoDisplay,
      facePreviewSrc: otherPhotoDisplay ? "set" : "missing",
      finalImgSrc: otherPhotoDisplay,
      extra: { otherPhotoRaw: row.otherPhoto },
    });
  }, [row.otherUserId, row.otherPhoto, otherPhotoDisplay]);

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/chat/${row.conversationId}`)}
        aria-label={
          hasUnread
            ? `${row.otherName || t("unnamed_profile")}, ${row.unreadCount} ${t("messages_unread_label")}`
            : `${row.otherName || t("unnamed_profile")}`
        }
        className={`flex w-full min-h-[4.25rem] items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition active:scale-[0.99] ${
          hasUnread
            ? "border-white/[0.14] bg-app-card shadow-[0_0_0_1px_rgba(255,30,45,0.12),0_8px_28px_rgba(0,0,0,0.28)] active:bg-app-card"
            : "border-app-border/40 bg-app-card/45 opacity-[0.88] active:bg-app-card/55"
        }`}
      >
        <div className="shrink-0">
          {row.otherPhoto && otherPhotoDisplay ? (
            <img
              src={otherPhotoDisplay}
              alt=""
              className={`h-[3.25rem] w-[3.25rem] rounded-full object-cover ring-2 ${
                hasUnread ? "ring-white/15" : "ring-app-border/80"
              }`}
              onLoad={(e) => {
                logPhotoTraceImgEvent(
                  "onLoad",
                  {
                    screen: "Messages",
                    component: "Messages.tsx/MessageThreadRowItem",
                    userId: row.otherUserId,
                    slot: "inbox_avatar",
                    srcReceived: otherPhotoDisplay,
                  },
                  e.currentTarget,
                );
              }}
              onError={(e) => {
                logPhotoTraceImgEvent(
                  "onError",
                  {
                    screen: "Messages",
                    component: "Messages.tsx/MessageThreadRowItem",
                    userId: row.otherUserId,
                    slot: "inbox_avatar",
                    srcReceived: otherPhotoDisplay,
                  },
                  e.currentTarget,
                );
              }}
            />
          ) : (
            <div
              className={`h-[3.25rem] w-[3.25rem] rounded-full ring-2 ${
                hasUnread ? "bg-app-border ring-white/15" : "bg-app-border/80 ring-app-border/60"
              }`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <p
            className={`truncate text-[15px] leading-snug ${
              hasUnread ? "font-semibold text-white" : "font-medium text-app-text/55"
            }`}
          >
            {row.otherName || t("unnamed_profile")}
          </p>
          <p
            className={`mt-0.5 truncate text-sm leading-snug ${
              hasUnread ? "font-medium text-white/90" : "font-normal text-app-muted/75"
            }`}
          >
            {row.lastMessage ?? t("messages_no_message_yet")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          {hasUnread ? (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF1E2D] px-1.5 text-[10px] font-bold leading-none text-white"
              aria-hidden
            >
              {formatBadge(row.unreadCount)}
            </span>
          ) : null}
          <span
            className={`select-none text-[1.35rem] font-light leading-none ${
              hasUnread ? "text-white/20" : "text-app-muted/35"
            }`}
            aria-hidden
          >
            ›
          </span>
        </div>
      </button>
    </li>
  );
}

export default function Messages() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondChanceCount, setSecondChanceCount] = useState(0);
  const inboxRealtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      void countPendingSecondChancesForUser(user.id).then(setSecondChanceCount);
      const blocked = await fetchBlockedRelatedUserIds();
      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select("id, user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

      if (mErr) throw mErr;

      const rawList = (matches ?? []) as { id: string; user_a: string; user_b: string }[];
      const mlist = rawList.filter((m) => {
        const other = m.user_a === user.id ? m.user_b : m.user_a;
        return !blocked.has(other);
      });
      if (mlist.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const matchById = new Map(mlist.map((m) => [m.id, m]));
      const matchIds = mlist.map((m) => m.id);

      const { data: convs, error: cErr } = await supabase
        .from("conversations")
        .select("id, match_id, created_at")
        .in("match_id", matchIds);

      if (cErr) throw cErr;

      const convList = (convs ?? []) as { id: string; match_id: string; created_at?: string | null }[];

      const otherIds = convList
        .map((c) => {
          const m = matchById.get(c.match_id);
          if (!m) return null;
          return m.user_a === user.id ? m.user_b : m.user_a;
        })
        .filter((x): x is string => x != null);

      const uniqueOther = [...new Set(otherIds)];

      const profById = new Map<string, { name: string | null; photo: string | null }>();
      if (uniqueOther.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, main_photo_url, portrait_url, avatar_url")
          .in("id", uniqueOther);

        for (const p of profs ?? []) {
          const row = p as {
            id: string;
            first_name?: string | null;
            main_photo_url?: string | null;
            portrait_url?: string | null;
            avatar_url?: string | null;
          };
          const photo =
            row.main_photo_url?.trim() || row.portrait_url?.trim() || row.avatar_url?.trim() || null;
          profById.set(row.id, { name: row.first_name?.trim() || null, photo });
        }
      }

      const convIds = convList.map((c) => c.id);
      const lastByConv = new Map<string, { body: string; created_at: string }>();

      if (convIds.length > 0) {
        const { data: msgs, error: msgErr } = await supabase
          .from(CHAT_MESSAGES_TABLE)
          .select("conversation_id, body, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(400);

        if (msgErr) {
          logSupabaseTableError(CHAT_MESSAGES_TABLE, "select", msgErr);
        } else {
          for (const raw of msgs ?? []) {
            const msg = raw as { conversation_id: string; body: string; created_at: string };
            if (!lastByConv.has(msg.conversation_id)) {
              lastByConv.set(msg.conversation_id, { body: msg.body, created_at: msg.created_at });
            }
          }
        }
      }

      const unreadByConv = await fetchUnreadCountByConversation(user.id, convIds);

      const out: InboxRow[] = convList.map((c) => {
        const m = matchById.get(c.match_id);
        const other = m ? (m.user_a === user.id ? m.user_b : m.user_a) : "";
        const p = profById.get(other);
        const lm = lastByConv.get(c.id);
        return {
          conversationId: c.id,
          matchId: c.match_id,
          otherUserId: other,
          otherName: p?.name ?? null,
          otherPhoto: p?.photo ?? null,
          lastMessage: lm?.body ?? null,
          lastAt: lm?.created_at ?? c.created_at ?? null,
          unreadCount: unreadByConv.get(c.id) ?? 0,
        };
      });

      out.sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });

      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loading_error"));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      if (user?.id) {
        void countPendingSecondChancesForUser(user.id).then(setSecondChanceCount);
        void load();
      }
    };
    window.addEventListener(INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, onRefresh);
  }, [user?.id, load]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const ch = supabase
      .channel(`messages-inbox:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: CHAT_MESSAGES_TABLE },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: CHAT_MESSAGES_TABLE },
        () => {
          void load();
        },
      )
      .subscribe();

    if (cancelled) {
      void supabase.removeChannel(ch);
      return;
    }
    inboxRealtimeRef.current = ch;

    return () => {
      cancelled = true;
      const existing = inboxRealtimeRef.current;
      inboxRealtimeRef.current = null;
      if (existing) void supabase.removeChannel(existing);
    };
  }, [user?.id, load]);

  if (!user?.id) {
    return (
      <div className="p-6 text-center text-sm text-app-muted">
        <p>{t("messages_login_required")}</p>
        <Link className="mt-4 inline-block font-semibold text-[#FF1E2D] underline" to="/auth">
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">{t("messages_title")}</p>
        <h1 className="mt-1 text-xl font-bold text-app-text">{t("messages_conversations")}</h1>
        <p className="mt-1 text-sm text-app-muted">{t("messages_subtitle")}</p>

        {secondChanceCount > 0 && (
          <div className="mt-4 rounded-2xl border border-app-border/90 bg-app-card/80 px-4 py-3 text-sm text-app-text shadow-sm">
            <p className="leading-snug text-app-text">{t("second_chance_messages_banner", { n: secondChanceCount })}</p>
            <button
              type="button"
              onClick={() => navigate("/second-chances")}
              className="mt-2 text-left text-[13px] font-semibold text-[#FF1E2D] underline"
            >
              {t("second_chance_inbox_open")}
            </button>
          </div>
        )}

        {loading && <p className="mt-6 text-sm text-app-muted">{t("loading")}</p>}
        {error && (
          <p className="mt-4 rounded-xl border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {!loading && !error && rows.length === 0 && <ReferralEmptyState language={language} />}

        {!loading && rows.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {rows.map((r) => (
              <MessageThreadRowItem key={r.conversationId} row={r} t={t} navigate={navigate} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
