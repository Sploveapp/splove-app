import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../i18n/useTranslation";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { supabase } from "../lib/supabase";
import { INBOX_REFRESH_EVENT } from "../constants";
import {
  fetchPendingSecondChancesForRecipient,
  type SecondChanceRequestRow,
} from "../services/secondChance.service";

type RowUi = SecondChanceRequestRow & { senderName: string | null; senderPhoto: string | null };

function InboxListRow(props: { row: RowUi; onOpen: (id: string) => void; openLabel: string }) {
  const { row, onOpen, openLabel } = props;
  const display = useProfilePhotoSignedUrl(row.senderPhoto);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="flex w-full items-center gap-3 rounded-2xl border border-app-border/90 bg-app-card px-3 py-3 text-left shadow-sm ring-1 ring-app-border/80 transition hover:bg-app-border/90"
      >
        {row.senderPhoto && display ? (
          <img src={display} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-app-border" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-app-border ring-2 ring-app-border" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-app-text">
            {row.senderName?.trim() || "…"}
          </p>
          <p className="line-clamp-2 text-sm text-app-muted">{row.message}</p>
        </div>
        <span className="shrink-0 text-[12px] font-medium text-app-muted">{openLabel}</span>
      </button>
    </li>
  );
}

export default function SecondChancesInbox() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RowUi[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await fetchPendingSecondChancesForRecipient(user.id);
    if (list.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const senderIds = list.map((r) => r.sender_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, first_name, main_photo_url, portrait_url, avatar_url")
      .in("id", senderIds);
    const byId = new Map<string, { name: string | null; photo: string | null }>();
    for (const p of profs ?? []) {
      const r = p as {
        id: string;
        first_name?: string | null;
        main_photo_url?: string | null;
        portrait_url?: string | null;
        avatar_url?: string | null;
      };
      const photo = r.main_photo_url?.trim() || r.portrait_url?.trim() || r.avatar_url?.trim() || null;
      byId.set(r.id, { name: r.first_name?.trim() || null, photo });
    }
    setRows(
      list.map((r) => {
        const s = byId.get(r.sender_id);
        return { ...r, senderName: s?.name ?? null, senderPhoto: s?.photo ?? null };
      }),
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener(INBOX_REFRESH_EVENT, h);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, h);
  }, [load]);

  if (!user?.id) {
    return <div className="p-6 text-sm text-app-muted">{t("messages_login_required")}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
          {t("second_chance_inbox_title")}
        </p>
        <h1 className="mt-1 text-xl font-bold text-app-text">{t("second_chance_received_title")}</h1>
        <p className="mt-1 text-sm text-app-muted">{t("second_chance_inbox_sub")}</p>

        {loading && <p className="mt-6 text-sm text-app-muted">{t("loading")}</p>}

        {!loading && rows.length === 0 && (
          <p className="mt-8 text-center text-sm text-app-muted">{t("second_chance_inbox_empty")}</p>
        )}

        {!loading && rows.length > 0 && (
          <ul className="mt-5 space-y-2">
            {rows.map((r) => (
              <InboxListRow
                key={r.id}
                row={r}
                openLabel={t("second_chance_inbox_open")}
                onOpen={(id) => navigate(`/second-chance/${id}`)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
