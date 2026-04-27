import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../i18n/useTranslation";
import { supabase } from "../lib/supabase";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { INBOX_REFRESH_EVENT } from "../constants";
import {
  fetchSecondChanceRequestById,
  respondSecondChanceRequest,
  type SecondChanceRequestRow,
} from "../services/secondChance.service";
function getAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 18 || age > 120) return null;
  return age;
}

type SenderMini = {
  first_name: string | null;
  birth_date: string | null;
  main_photo_url: string | null;
  portrait_url: string | null;
};

function getDisplayPhoto(p: SenderMini | null): string | null {
  if (!p) return null;
  for (const u of [p.main_photo_url, p.portrait_url]) {
    const s = typeof u === "string" ? u.trim() : "";
    if (s) return s;
  }
  return null;
}

export default function SecondChanceDecision() {
  const { requestId } = useParams();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [row, setRow] = useState<SecondChanceRequestRow | null>(null);
  const [sender, setSender] = useState<SenderMini | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const displayUrl = getDisplayPhoto(sender);
  const displayPhoto = useProfilePhotoSignedUrl(displayUrl);

  const load = useCallback(async () => {
    if (!user?.id || !requestId) return;
    setLoadError(null);
    const r = await fetchSecondChanceRequestById(requestId);
    if (!r) {
      setLoadError("not_found");
      return;
    }
    if (r.recipient_id !== user.id) {
      setLoadError("forbidden");
      return;
    }
    setRow(r);
    const { data: p } = await supabase
      .from("profiles")
      .select("first_name, birth_date, main_photo_url, portrait_url")
      .eq("id", r.sender_id)
      .maybeSingle();
    if (p) {
      setSender(p as SenderMini);
    } else {
      setSender({ first_name: null, birth_date: null, main_photo_url: null, portrait_url: null });
    }
  }, [requestId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onIgnore = useCallback(async () => {
    if (!row || busy) return;
    setBusy(true);
    setActionError(null);
    const res = await respondSecondChanceRequest(row.id, false);
    setBusy(false);
    if (!res.ok) {
      const c = res.error;
      if (c === "match_failed" || c === "likes_incomplete") setActionError(t("second_chance_err_match"));
      else if (c === "blocked") setActionError(t("second_chance_err_blocked"));
      else setActionError(t("error"));
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent(INBOX_REFRESH_EVENT));
    } catch {
      /* ignore */
    }
    navigate("/messages", { replace: true });
  }, [busy, navigate, row, t]);

  const onAccept = useCallback(async () => {
    if (!row || busy) return;
    setBusy(true);
    setActionError(null);
    const res = await respondSecondChanceRequest(row.id, true);
    setBusy(false);
    if (!res.ok) {
      const c = res.error;
      if (c === "match_failed" || c === "likes_incomplete") setActionError(t("second_chance_err_match"));
      else if (c === "blocked") setActionError(t("second_chance_err_blocked"));
      else setActionError(t("error"));
      return;
    }
    if (res.status === "accepted" && res.conversationId) {
      try {
        window.dispatchEvent(new CustomEvent(INBOX_REFRESH_EVENT));
      } catch {
        /* ignore */
      }
      const partnerName = sender?.first_name?.trim() || "";
      const partnerMainPhotoUrl = getDisplayPhoto(sender) ?? null;
      navigate(`/match/${res.conversationId}`, {
        replace: true,
        state: {
          partnerFirstName: partnerName,
          partnerMainPhotoUrl,
          /** Recipient accepts → she « completes » the match; aligns with women-first messaging. */
          matchedByUserId: user?.id ?? null,
          sharedSports: [],
        },
      });
      return;
    }
    navigate("/messages", { replace: true });
  }, [busy, navigate, row, sender, user?.id, t]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-8 pt-6 text-app-text">
        <h1 className="text-lg font-semibold">
          {loadError === "forbidden" ? t("second_chance_forbidden") : t("second_chance_gone")}
        </h1>
        <button
          type="button"
          onClick={() => navigate("/messages")}
          className="mt-4 rounded-xl border border-app-border px-4 py-2 text-sm"
        >
          {t("back")}
        </button>
      </main>
    );
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 text-center text-app-muted">
        {t("loading")}
      </main>
    );
  }

  if (row.status !== "pending") {
    return (
      <main className="mx-auto max-w-lg px-4 pb-8 pt-6 text-app-text">
        <h1 className="text-lg font-semibold">{t("second_chance_resolved")}</h1>
        <button
          type="button"
          onClick={() => navigate("/messages")}
          className="mt-4 rounded-xl border border-app-border px-4 py-2 text-sm"
        >
          {t("back")}
        </button>
      </main>
    );
  }

  const name = sender?.first_name?.trim() || t("unnamed_profile");
  const age = getAgeFromBirthDate(sender?.birth_date ?? null);

  return (
    <main className="mx-auto max-w-lg flex-1 px-4 pb-8 pt-6">
      <h1 className="text-center text-lg font-semibold text-app-text">{t("second_chance_received_title")}</h1>
      <p className="mt-1 text-center text-[12px] text-app-muted">{t("second_chance_received_sub")}</p>

      <div className="mt-8 flex flex-col items-center">
        {displayUrl ? (
          displayPhoto ? (
            <img
              src={displayPhoto}
              alt=""
              className="h-24 w-24 rounded-full object-cover ring-2 ring-app-border"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-app-border ring-2 ring-app-border" />
          )
        ) : (
          <div className="h-24 w-24 rounded-full bg-app-border ring-2 ring-app-border" />
        )}
        <p className="mt-3 text-[17px] font-semibold text-app-text">
          {name}
          {age != null ? (language === "en" ? `, ${age}` : `, ${age} ans`) : ""}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-app-border/90 bg-app-card/60 px-4 py-4 text-[15px] leading-relaxed text-app-text ring-1 ring-white/[0.04]">
        <p className="whitespace-pre-wrap break-words">{row.message}</p>
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/30 px-3 py-2 text-sm text-amber-100/95">
          {actionError}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={() => void onIgnore()}
          disabled={busy}
          className="w-full rounded-xl border border-app-border py-3 text-[15px] font-medium text-app-muted transition hover:text-app-text disabled:opacity-50"
        >
          {t("second_chance_ignore")}
        </button>
        <button
          type="button"
          onClick={() => void onAccept()}
          disabled={busy}
          className="w-full rounded-xl border border-app-border/80 bg-app-bg py-3 text-[15px] font-semibold text-app-text disabled:opacity-50"
        >
          {busy ? "…" : t("second_chance_accept_match")}
        </button>
      </div>
    </main>
  );
}
