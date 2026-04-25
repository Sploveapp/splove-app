/**
 * Mes rencontres — agenda (données Supabase du dépôt)
 *
 * Colonnes réellement prévues dans les migrations (agrégat, ordre d’application variable) :
 *
 * **activity_proposals** (schéma MVP 062 — pas de `match_id` sur cette table) :
 * id, conversation_id, proposer_id, sport, place, scheduled_at, status, counter_of,
 * responded_by, responded_at, created_at ; champs flux chat souvent présents : time_slot,
 * location, note ; optionnels selon migrations : boost_awarded, supersedes_proposal_id.
 * Pas de receiver_id : l’autre personne = `matches.user_a` ou `user_b` (≠ moi), via
 * `activity_proposals.conversation_id` → `conversations.match_id` → `matches`.
 *
 * Select client : uniquement des colonnes existantes sur `activity_proposals` (pas de
 * `match_id` sur cette table — le match est résolu par `conversations`).
 *
 * **conversations** (024) : id, match_id, created_at
 * **matches** (0085) : id, user_a, user_b, …
 * **messages** (053+) : conversation_id, sender_id, body, created_at, message_type,
 * activity_proposal_id, metadata, payload, read_at (054) — non lues par cette page.
 *
 * Le libellé lieu utilise `location` (souvent aligné avec `place` côté SQL).
 *
 * ---
 * Logique des onglets (après normalizeActivityProposalStatus : proposed → pending) :
 *
 * - **À répondre** : proposer_id ≠ utilisateur courant ET statut ∈ { pending, countered }
 *   (tu n’es pas l’auteur de la proposition en attente / contre-proposition à traiter).
 * - **À venir** : statut = accepted ET scheduled_at défini ET scheduled_at > maintenant.
 * - **Passées** : statut ∈ { declined, cancelled } OU (accepted ET scheduled_at ≤ maintenant).
 *   Les lignes hors ces cas (ex. statut legacy non mappé) ne sont listées dans aucun onglet.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MeetingCard, type MeetingCardTab } from "../components/MeetingCard";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import {
  ACTIVITY_PROPOSALS_SELECT,
  ACTIVITY_PROPOSALS_SELECT_MINIMAL,
  isMissingColumnError,
} from "../lib/activityProposalsQuery";
import { normalizeActivityProposalStatus } from "../lib/messages/activityProposal";
import {
  acceptActivityProposal,
  cancelActivityProposal,
  createCounterProposal,
  declineActivityProposal,
} from "../lib/messages/activityProposalMutations";
import { useTranslation } from "../i18n/useTranslation";

/** Colonnes demandées au select — aucune colonne inventée ; pas de `match_id` sur `activity_proposals`. */
type ProposalRow = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  sport: string;
  place?: string | null;
  time_slot: string;
  location: string | null;
  note: string | null;
  created_at: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  counter_of?: string | null;
  boost_awarded?: boolean | null;
  supersedes_proposal_id?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
};

type ProfileLite = {
  id: string;
  first_name: string | null;
  main_photo_url: string | null;
  portrait_url: string | null;
};

type TabKey = "to_confirm" | "confirmed" | "expired" | "cancelled";

function formatMeetingAgendaLabel(d: Date): string {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(d);
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const h = d.getHours();
  const m = d.getMinutes();
  const timePart = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  return `${cap} ${timePart}`;
}

function whenLabel(p: ProposalRow): string {
  if (p.scheduled_at) {
    const d = new Date(p.scheduled_at);
    if (!Number.isNaN(d.getTime())) return formatMeetingAgendaLabel(d);
  }
  const ts = (p.time_slot ?? "").trim();
  if (ts) return ts;
  return "date_to_confirm";
}

function placeLabel(p: ProposalRow): string {
  const raw = ((p.place ?? p.location) ?? "").trim();
  if (!raw || raw === "À définir") return "place_to_define";
  return raw;
}

function needsMyResponse(uid: string, p: ProposalRow): boolean {
  if (!uid || p.proposer_id === uid) return false;
  const st = normalizeActivityProposalStatus(p.status);
  return st === "pending" || st === "countered";
}

function isExpiredSection(p: ProposalRow, now: number): boolean {
  const st = normalizeActivityProposalStatus(p.status);
  if (st === "expired") return true;
  if (st !== "pending" && st !== "proposed" && st !== "countered") return false;
  if (!p.created_at) return false;
  const fallback = parseCreatedMs(p.created_at) + 48 * 60 * 60 * 1000;
  const exp = p.expires_at ? new Date(p.expires_at).getTime() : fallback;
  if (!Number.isFinite(exp)) return false;
  return exp <= now;
}

function statusBadgeLabel(status: string | null | undefined): string {
  const s = normalizeActivityProposalStatus(status);
  if (s === "pending") return "status_pending";
  if (s === "accepted") return "status_confirmed";
  if (s === "declined") return "status_declined";
  if (s === "countered") return "status_counter_proposal";
  if (s === "cancelled") return "status_cancelled";
  return "status_pending";
}

function statusBadgeTone(
  status: string | null | undefined,
): "neutral" | "success" | "warning" | "danger" | "muted" {
  const s = normalizeActivityProposalStatus(status);
  if (s === "accepted") return "success";
  if (s === "declined") return "danger";
  if (s === "countered") return "warning";
  if (s === "cancelled") return "muted";
  return "neutral";
}

function defaultCounterDateParts(): { date: string; time: string } {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(18, 30, 0, 0);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

function parseCreatedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? 0 : n;
}

export default function MesRencontres() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const agendaBg = "#F4F6F8";

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = agendaBg;
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [otherByConv, setOtherByConv] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<TabKey>("to_confirm");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterProposal, setCounterProposal] = useState<ProposalRow | null>(null);
  const [counterDate, setCounterDate] = useState("");
  const [counterTime, setCounterTime] = useState("");

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setProfilesById({});
      setOtherByConv({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    let data: unknown = null;
    let error = null as { code?: string; message?: string } | null;
    let usedSelect = ACTIVITY_PROPOSALS_SELECT;

    const first = await supabase
      .from("activity_proposals")
      .select(ACTIVITY_PROPOSALS_SELECT)
      .order("created_at", { ascending: false });

    if (first.error && isMissingColumnError(first.error)) {
      usedSelect = ACTIVITY_PROPOSALS_SELECT_MINIMAL;
      const second = await supabase
        .from("activity_proposals")
        .select(ACTIVITY_PROPOSALS_SELECT_MINIMAL)
        .order("created_at", { ascending: false });
      data = second.data;
      error = second.error;
    } else {
      data = first.data;
      error = first.error;
    }

    if (error) {
      console.error("[MesRencontres] load proposals", error);
      setLoadError(error.message?.trim() || t("loading_list_failed"));
      setRows([]);
      setProfilesById({});
      setOtherByConv({});
      setLoading(false);
      return;
    }

    const list = (data as ProposalRow[]) ?? [];
    console.log("[MesRencontres] activity_proposals select (no activity_proposals.match_id):", usedSelect);
    console.log(
      "[MesRencontres] first row keys returned:",
      list[0] ? Object.keys(list[0] as object) : [],
    );
    setRows(list);

    const convIds = [...new Set(list.map((r) => r.conversation_id).filter(Boolean))];
    if (convIds.length === 0) {
      setOtherByConv({});
      setProfilesById({});
      setLoading(false);
      return;
    }

    const { data: convs, error: convErr } = await supabase
      .from("conversations")
      .select("id, match_id")
      .in("id", convIds);

    if (convErr) {
      console.error("[MesRencontres] conversations", convErr);
      setOtherByConv({});
      setProfilesById({});
      setLoading(false);
      return;
    }

    const matchIds = [...new Set((convs ?? []).map((c: { match_id: string }) => c.match_id).filter(Boolean))];
    const { data: matches, error: matchErr } = await supabase
      .from("matches")
      .select("id, user_a, user_b")
      .in("id", matchIds);

    if (matchErr) {
      console.error("[MesRencontres] matches", matchErr);
      setOtherByConv({});
      setProfilesById({});
      setLoading(false);
      return;
    }

    const matchById = new Map<string, { user_a: string; user_b: string }>();
    for (const m of matches ?? []) {
      const row = m as { id: string; user_a: string; user_b: string };
      matchById.set(row.id, { user_a: row.user_a, user_b: row.user_b });
    }

    const convToOther: Record<string, string> = {};
    for (const c of convs ?? []) {
      const conv = c as { id: string; match_id: string };
      const ma = matchById.get(conv.match_id);
      if (!ma) continue;
      const other = ma.user_a === uid ? ma.user_b : ma.user_a;
      convToOther[conv.id] = other;
    }
    setOtherByConv(convToOther);

    const otherIds = [...new Set(Object.values(convToOther))];
    if (otherIds.length === 0) {
      setProfilesById({});
      setLoading(false);
      return;
    }

    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id, first_name, main_photo_url, portrait_url")
      .in("id", otherIds);

    if (profErr) {
      console.error("[MesRencontres] profiles", profErr);
      setProfilesById({});
      setLoading(false);
      return;
    }

    const pmap: Record<string, ProfileLite> = {};
    for (const p of profs ?? []) {
      const pl = p as ProfileLite;
      pmap[pl.id] = pl;
    }
    setProfilesById(pmap);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const { toConfirmList, confirmedList, expiredList, cancelledList } = useMemo(() => {
    const toConfirm: ProposalRow[] = [];
    const confirmed: ProposalRow[] = [];
    const expired: ProposalRow[] = [];
    const cancelled: ProposalRow[] = [];
    for (const p of rows) {
      const st = normalizeActivityProposalStatus(p.status);
      if (isExpiredSection(p, nowTick)) {
        expired.push(p);
      } else if (st === "cancelled" || st === "declined") {
        cancelled.push(p);
      } else if (st === "accepted") {
        confirmed.push(p);
      } else if (st === "pending" || st === "proposed" || st === "countered") {
        toConfirm.push(p);
      }
    }
    toConfirm.sort((a, b) => parseCreatedMs(b.created_at) - parseCreatedMs(a.created_at));
    confirmed.sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : parseCreatedMs(a.created_at);
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : parseCreatedMs(b.created_at);
      return tb - ta;
    });
    expired.sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : parseCreatedMs(a.created_at);
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : parseCreatedMs(b.created_at);
      return tb - ta;
    });
    cancelled.sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : parseCreatedMs(a.created_at);
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : parseCreatedMs(b.created_at);
      return tb - ta;
    });
    return { toConfirmList: toConfirm, confirmedList: confirmed, expiredList: expired, cancelledList: cancelled };
  }, [rows, uid, nowTick]);

  function partnerForProposal(p: ProposalRow): ProfileLite | null {
    const oid = otherByConv[p.conversation_id];
    if (!oid) return null;
    return profilesById[oid] ?? null;
  }

  function partnerPhoto(p: ProposalRow): string | null {
    const pr = partnerForProposal(p);
    if (!pr) return null;
    const main = pr.main_photo_url?.trim();
    const port = pr.portrait_url?.trim();
    return main || port || null;
  }

  function partnerName(p: ProposalRow): string | null {
    return partnerForProposal(p)?.first_name?.trim() || null;
  }

  function openChat(p: ProposalRow) {
    navigate(`/chat/${p.conversation_id}`, {
      state: {
        partnerFirstName: partnerName(p),
        partnerMainPhotoUrl: partnerPhoto(p),
      },
    });
  }

  function openMatch(p: ProposalRow) {
    const oid = otherByConv[p.conversation_id];
    navigate(`/match/${p.conversation_id}`, {
      state: {
        partnerFirstName: partnerName(p),
        partnerMainPhotoUrl: partnerPhoto(p),
        matchedByUserId: oid ?? null,
      },
    });
  }

  async function handleConfirm(p: ProposalRow) {
    if (!uid) return;
    setPageError(null);
    setActionBusyId(p.id);
    const res = await acceptActivityProposal(supabase, {
      proposalId: p.id,
      conversationId: p.conversation_id,
      currentUserId: uid,
    });
    setActionBusyId(null);
    if ("error" in res) {
      setPageError(res.error.message);
      return;
    }
    await loadData();
  }

  async function handleDecline(p: ProposalRow) {
    if (!uid) return;
    setPageError(null);
    setActionBusyId(p.id);
    const res = await declineActivityProposal(supabase, {
      proposalId: p.id,
      conversationId: p.conversation_id,
      currentUserId: uid,
    });
    setActionBusyId(null);
    if ("error" in res) {
      setPageError(res.error.message);
      return;
    }
    await loadData();
  }

  async function handleCancel(p: ProposalRow) {
    setPageError(null);
    setActionBusyId(p.id);
    const res = await cancelActivityProposal(supabase, { proposalId: p.id });
    setActionBusyId(null);
    if ("error" in res) {
      setPageError(res.error.message);
      return;
    }
    await loadData();
  }

  function openCounterModal(p: ProposalRow) {
    const { date, time } = defaultCounterDateParts();
    setCounterProposal(p);
    setCounterDate(date);
    setCounterTime(time);
    setCounterOpen(true);
    setPageError(null);
  }

  async function submitCounter() {
    if (!uid || !counterProposal) return;
    const d = new Date(`${counterDate}T${counterTime}:00`);
    if (Number.isNaN(d.getTime())) {
      setPageError(t("invalid_date_or_time"));
      return;
    }
    const timeLabel = formatMeetingAgendaLabel(d);
    const scheduledAt = d.toISOString();
    const loc = placeLabel(counterProposal);
    setPageError(null);
    setActionBusyId(counterProposal.id);
    const res = await createCounterProposal(supabase, {
      replaceProposalId: counterProposal.id,
      conversationId: counterProposal.conversation_id,
      currentUserId: uid,
      sport: (counterProposal.sport ?? "").trim() || t("activity"),
      timeSlot: timeLabel,
      location: loc === "place_to_define" ? "À définir" : loc,
      note: null,
      scheduledAt,
    });
    setActionBusyId(null);
    if ("error" in res) {
      setPageError(res.error.message);
      return;
    }
    setCounterOpen(false);
    setCounterProposal(null);
    await loadData();
  }

  const tabToCard: Record<TabKey, MeetingCardTab> = {
    to_confirm: "respond",
    confirmed: "upcoming",
    expired: "past",
    cancelled: "past",
  };

  const currentList =
    tab === "to_confirm"
      ? toConfirmList
      : tab === "confirmed"
        ? confirmedList
        : tab === "expired"
          ? expiredList
          : cancelledList;

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col bg-[#F4F6F8] font-sans text-zinc-900"
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b border-zinc-200/90 bg-[#F4F6F8]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
          <header>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
              {t("my_meetups")}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-500">
              {t("meetups_subtitle")}
            </p>
          </header>

          <div
            className="mt-4 flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label={t("meetups_filter")}
          >
            {(
              [
                { id: "to_confirm" as const, label: t("to_confirm") },
                { id: "confirmed" as const, label: t("confirmed") },
                { id: "expired" as const, label: t("expired") },
                { id: "cancelled" as const, label: t("cancelled") },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-[44px] flex-1 rounded-[10px] px-1.5 text-[13px] font-semibold leading-tight transition ${
                  tab === t.id ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-4 pt-4">
          {loadError ? (
            <p className="mb-4 text-[14px] text-red-600" role="alert">
              {loadError}
            </p>
          ) : null}

          {pageError ? (
            <p
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
              role="alert"
            >
              {pageError}
            </p>
          ) : null}

          {loading ? (
            <p className="py-12 text-center text-[15px] text-zinc-500">{t("loading")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {tab === "to_confirm" && toConfirmList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center shadow-sm">
                  <p className="text-[15px] font-medium text-zinc-700">{t("nothing_pending_now")}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">
                    {t("pending_will_appear_here")}
                  </p>
                </div>
              ) : null}

              {tab === "confirmed" && confirmedList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center shadow-sm">
                  <p className="text-[15px] font-medium text-zinc-700">{t("no_upcoming_meetups")}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">
                    {t("confirmed_slots_here")}
                  </p>
                </div>
              ) : null}

              {tab === "expired" && expiredList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center shadow-sm">
                  <p className="text-[14px] leading-relaxed text-zinc-500">
                    {t("no_expired_meetups")}
                  </p>
                </div>
              ) : null}

              {tab === "cancelled" && cancelledList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center shadow-sm">
                  <p className="text-[14px] leading-relaxed text-zinc-500">
                    {t("no_cancelled_meetups")}
                  </p>
                </div>
              ) : null}

              {currentList.map((p) => (
                <MeetingCard
                  key={p.id}
                  tab={tabToCard[tab]}
                  sport={(p.sport ?? "").trim() || t("activity")}
                  placeLabel={placeLabel(p) === "place_to_define" ? t("place_to_define") : placeLabel(p)}
                  whenLabel={whenLabel(p)}
                  partnerFirstName={partnerName(p)}
                  partnerPhotoUrl={partnerPhoto(p)}
                  statusLabel={t(statusBadgeLabel(p.status))}
                  badgeTone={statusBadgeTone(p.status)}
                  busy={actionBusyId === p.id}
                  onConfirm={tab === "to_confirm" && needsMyResponse(uid, p) ? () => void handleConfirm(p) : undefined}
                  onDecline={tab === "to_confirm" && needsMyResponse(uid, p) ? () => void handleDecline(p) : undefined}
                  onCounter={tab === "to_confirm" && needsMyResponse(uid, p) ? () => openCounterModal(p) : undefined}
                  onOpenChat={
                    tab === "to_confirm" || tab === "confirmed" ? () => openChat(p) : undefined
                  }
                  onCancel={tab === "confirmed" ? () => void handleCancel(p) : undefined}
                  onRepropose={tab === "expired" || tab === "cancelled" ? () => openMatch(p) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {counterOpen && counterProposal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="counter-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 id="counter-modal-title" className="text-lg font-semibold text-zinc-900">
              {t("propose_other")}
            </h2>
            <p className="mt-1 text-[13px] text-zinc-500">
              {t("counter_proposal_hint")}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="text-[13px] font-medium text-zinc-700">
                {t("date")}
                <input
                  type="date"
                  value={counterDate}
                  onChange={(e) => setCounterDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] text-zinc-900"
                />
              </label>
              <label className="text-[13px] font-medium text-zinc-700">
                {t("time")}
                <input
                  type="time"
                  value={counterTime}
                  onChange={(e) => setCounterTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] text-zinc-900"
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCounterOpen(false);
                  setCounterProposal(null);
                }}
                className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-[15px] font-semibold text-zinc-700"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={actionBusyId === counterProposal.id}
                onClick={() => void submitCounter()}
                className="flex-1 rounded-xl py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#18181B" }}
              >
                {t("send")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
