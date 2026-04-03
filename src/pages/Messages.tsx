import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { fetchBlockedRelatedUserIds } from "../services/blocks.service";

type InboxRow = {
  conversationId: string;
  matchId: string;
  otherUserId: string;
  otherName: string | null;
  otherPhoto: string | null;
  lastMessage: string | null;
  lastAt: string | null;
};

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
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
        };
      });

      out.sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });

      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user?.id) {
    return (
      <div className="p-6 text-center text-sm text-app-muted">
        <p>Connectez-vous pour voir vos messages.</p>
        <Link className="mt-4 inline-block font-semibold text-[#FF1E2D] underline" to="/auth">
          Connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Messages</p>
        <h1 className="mt-1 text-xl font-bold text-app-text">Conversations</h1>
        <p className="mt-1 text-sm text-app-muted">Tous vos matchs et fils de discussion.</p>

        {loading && <p className="mt-6 text-sm text-app-muted">Chargement…</p>}
        {error && (
          <p className="mt-4 rounded-xl border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-app-border bg-app-card px-5 py-10 text-center shadow-sm">
            <p className="text-sm leading-relaxed text-app-muted">
              Aucune conversation pour l’instant. Quand vous avez un match, la discussion apparaît ici — vous pouvez aussi
              ouvrir le chat depuis l’écran de match.
            </p>
            <button
              type="button"
              onClick={() => navigate("/discover")}
              className="mt-4 rounded-full bg-[#FF1E2D] px-4 py-2 text-sm font-semibold text-white"
            >
              Découvrir des profils
            </button>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <ul className="mt-5 space-y-2">
            {rows.map((r) => (
              <li key={r.conversationId}>
                <button
                  type="button"
                  onClick={() => navigate(`/chat/${r.conversationId}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-app-border/90 bg-app-card px-3 py-3 text-left shadow-sm ring-1 ring-app-border/80 transition hover:bg-app-border/90"
                >
                  {r.otherPhoto ? (
                    <img
                      src={r.otherPhoto}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-app-border"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-app-border ring-2 ring-app-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-app-text">{r.otherName || "Profil"}</p>
                    <p className="truncate text-sm text-app-muted">
                      {r.lastMessage ?? "Pas encore de message — dites bonjour !"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] font-medium text-[#FF1E2D]">Ouvrir</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
