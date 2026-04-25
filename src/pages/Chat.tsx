import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { INBOX_REFRESH_EVENT } from "../constants";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { insertBlock, isBlockedWith } from "../services/blocks.service";
import { isPhotoVerified } from "../lib/profileVerification";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconSend } from "../components/ui/Icon";
import { ProposalCard } from "../components/ProposalCard";
import { ActivityResponseBubble } from "../components/chat/ActivityResponseBubble";
import { ActivityProposalBubble } from "../components/chat/ActivityProposalBubble";
import { ProposalComposerModal } from "../components/ProposalComposerModal";
import { ChatEmojiPicker } from "../components/ChatEmojiPicker";
import { ChatPostMatchPanel } from "../components/ChatPostMatchPanel";
import { PriorityProposalUpsell } from "../components/PriorityProposalUpsell";
import type { ActivityPayload } from "../lib/chatActivity";
import {
  computeProposalSchedule,
  getMatchOpenedAt,
  getProductState,
  touchMatchOpenedAt,
} from "../lib/chatActivity";
import { isPendingProposalStatus, normalizeActivityProposalStatus } from "../lib/messages/activityProposal";
import { buildActivityProposalRowForRender } from "../lib/messages/activityMessageParser";
import {
  acceptConversationProposal,
  cancelConversationProposal,
  createConversationProposal,
  declineConversationProposal,
  getLatestProposalForConversation,
  listConversationProposals,
  requestConversationProposalReschedule,
} from "../services/activityProposals.service";
import {
  assertProposalActionAllowed,
  buildProposalRulesContext,
  getAvailableProposalActions,
} from "../lib/messages/activityProposalRules";
import { ensureConversationWindow } from "../lib/ensureConversationWindow";
import {
  BLOCK_PROFILE_CONFIRM,
  BLOCK_PROFILE_LINK_LABEL,
  CHAT_FIRST_MESSAGE_HINT_HOMME,
  REPORT_LINK_LABEL,
  SAFETY_CONTENT_REFUSAL,
} from "../constants/copy";
import { canUserSendChatTextMessage } from "../lib/chatFirstMessagePolicy";
import { ReportModal } from "../components/ReportModal";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { messageContainsDisallowedContent } from "../lib/chatMessagePolicy";
import { CHAT_BUBBLE_COLOR_ORDER, getChatBubbleColorDef } from "../constants/chatBubbleColors";
import { usePremium } from "../hooks/usePremium";
import {
  getSplovePlusState,
  hasAutoRelanceBeenSent,
  markAutoRelanceSent,
} from "../services/splovePlus.service";
import {
  getOwnMessageBubbleClassName,
  loadConversationMessageBubbleThemeFromStorage,
  saveConversationMessageBubbleThemeToStorage,
  type MessageBubbleTheme,
} from "../lib/messageBubbleTheme";

const CHAT_WINDOW_HOURS_MS = 48 * 60 * 60 * 1000;
/** 1 h après le créneau pour proposer un retour discret (anti-prompt agressif). */
const ACTIVITY_FEEDBACK_DELAY_MS = 60 * 60 * 1000;
const TYPING_PULSE_DEBOUNCE_MS = 450;
const TYPING_IDLE_STOP_MS = 2500;
const TYPING_PARTNER_VISIBLE_MS = 3500;
const TYPING_SENTINEL_ISO = "1970-01-01T00:00:00.000Z";
/** Registre unique `chatBubbleColors` — Profil (aperçu) et Chat. */
const CHAT_ACCENT_OPTIONS = CHAT_BUBBLE_COLOR_ORDER;
const CHAT_DEFAULT_ACCENT: MessageBubbleTheme = "violet";

export type ActivityFeedbackSentiment = "positive" | "neutral" | "negative";

const CHAT_QUICK_SUGGESTIONS = [
  "Salut ! Tu es dispo bientôt ?",
  "On se fixe un lieu ensemble ?",
  "Partant(e) pour un créneau ?",
] as const;

type ChatSessionPhase = "new_match" | "active_chat" | "inactive";

type ChatLocationState = {
  partnerFirstName?: string | null;
  partnerMainPhotoUrl?: string | null;
  sharedSports?: string[];
  matchedByUserId?: string | null;
};

type ProposalStatus = "pending" | "accepted" | "declined" | "expired" | "reschedule_requested" | "cancelled";

type ProposalRow = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  match_id: string;
  sport: string;
  time_slot: string;
  location: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  status?: ProposalStatus | string | null;
  expires_at?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
  reminder_6h_sent?: boolean | null;
  reminder_18h_sent?: boolean | null;
  expired_notified?: boolean | null;
  supersedes_proposal_id?: string | null;
};

type TextMessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  message_type?: string | null;
  activity_proposal_id?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Si le schéma expose une colonne `payload` plus tard. */
  payload?: unknown;
};

type ChatTimelineItem =
  | { kind: "message"; sortKey: string; createdMs: number; message: TextMessageRow }
  | { kind: "proposal"; sortKey: string; createdMs: number; proposal: ProposalRow };

type AvailabilitySlot = {
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

function parseCreatedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function timeToMinutes(value: string): number {
  const parts = value.split(":");
  if (parts.length < 2) return 0;
  const hh = Number(parts[0] ?? 0);
  const mm = Number(parts[1] ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function buildOverlapSlotSuggestions(
  currentUserId: string,
  partnerId: string,
  rows: AvailabilitySlot[],
): string[] {
  const mine = rows.filter((r) => r.user_id === currentUserId);
  const partner = rows.filter((r) => r.user_id === partnerId);
  if (mine.length === 0 || partner.length === 0) return [];

  const now = new Date();
  const suggestions: string[] = [];
  for (const m of mine) {
    for (const p of partner) {
      if (m.day_of_week !== p.day_of_week) continue;
      const startMin = Math.max(timeToMinutes(m.start_time), timeToMinutes(p.start_time));
      const endMin = Math.min(timeToMinutes(m.end_time), timeToMinutes(p.end_time));
      if (endMin - startMin < 30) continue;

      for (let offset = 0; offset < 14; offset += 1) {
        const candidate = new Date(now);
        candidate.setHours(0, 0, 0, 0);
        candidate.setDate(now.getDate() + offset);
        if (candidate.getDay() !== m.day_of_week) continue;
        const h = Math.floor(startMin / 60);
        const mm = startMin % 60;
        candidate.setHours(h, mm, 0, 0);
        if (candidate.getTime() <= now.getTime() + 30 * 60 * 1000) continue;
        suggestions.push(candidate.toISOString());
        break;
      }
      if (suggestions.length >= 2) {
        return suggestions.slice(0, 2);
      }
    }
  }
  return suggestions.slice(0, 2);
}

function formatProposalWhenLine(p: ProposalRow): string {
  return p.time_slot?.trim() || "Date à confirmer";
}

function normalizeProposalStatus(p: ProposalRow): string {
  return normalizeActivityProposalStatus(p.status);
}

function isCounterProposedModalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "counter_proposed" || s === "countered" || s === "replaced" || s === "reschedule_requested";
}

function genericProposalError() {
  return "Une erreur est survenue. Réessaie.";
}

function proposalStatusLabelFr(p: ProposalRow): string {
  const s = normalizeProposalStatus(p);
  if (s === "accepted") return "Acceptée";
  if (s === "declined") return "Refusée";
  if (s === "expired") return "Expirée";
  if (s === "cancelled") return "Annulée";
  if (s === "reschedule_requested") return "Replanification demandée";
  if (s === "alternative_requested") return "Autre activité demandée";
  if (s === "replaced" || s === "countered") return "Contre-proposition envoyée";
  if (s === "pending" || s === "proposed") return "En attente de réponse";
  return "Proposition";
}

/** Libellé figé sous la carte / le détail lorsque la proposition n’est plus modifiable. */
function proposalFrozenStateLineFr(p: ProposalRow): string {
  const s = normalizeProposalStatus(p);
  if (s === "accepted") return "✅ Accepté";
  if (s === "declined") return "Pas dispo pour cette activité";
  if (s === "expired") return "Proposition expirée";
  if (s === "cancelled") return "Proposition annulée";
  if (s === "reschedule_requested") return "Replanification demandée";
  if (s === "countered" || s === "replaced") return "Contre-proposition envoyée";
  return proposalStatusLabelFr(p);
}

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const navState = (location.state ?? null) as ChatLocationState | null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(navState?.partnerFirstName?.trim() || null);
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(navState?.partnerMainPhotoUrl?.trim() || null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [latestProposalTop, setLatestProposalTop] = useState<ProposalRow | null>(null);
  const [windowExpiresAt, setWindowExpiresAt] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [proposalDetail, setProposalDetail] = useState<ProposalRow | null>(null);
  /** Id message proposition concerné, ou `__create__` pendant création / contre-proposition. */
  const [proposalActionInFlightId, setProposalActionInFlightId] = useState<string | null>(null);
  /** Fin de fenêtre pour afficher « … est en train d’écrire » (partenaire uniquement). */
  const [partnerTypingUntil, setPartnerTypingUntil] = useState(0);
  /** Table `conversation_typing` parfois absente — désactive upserts + realtime après erreur schéma. */
  const [conversationTypingDisabled, setConversationTypingDisabled] = useState(false);
  const typingPulseTimerRef = useRef<number | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const [counterReplaceProposalId, setCounterReplaceProposalId] = useState<string | null>(null);
  const [counterPrefill, setCounterPrefill] = useState<{ sport: string; place: string } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [chatMessages, setChatMessages] = useState<TextMessageRow[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagePolicyError, setMessagePolicyError] = useState<string | null>(null);
  const [pairBlocked, setPairBlocked] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const blockPartnerInFlightRef = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [partnerPhotoVerified, setPartnerPhotoVerified] = useState(false);
  const [chatMatchId, setChatMatchId] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);
  const [chatAccentTheme, setChatAccentTheme] = useState<MessageBubbleTheme>(CHAT_DEFAULT_ACCENT);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [chatStyleOpen, setChatStyleOpen] = useState(false);
  const chatMessageInputRef = useRef<HTMLTextAreaElement>(null);
  const chatLoadSeqRef = useRef(0);
  const chatLoadWatchdogRef = useRef<number | null>(null);
  const authWatchdogRef = useRef<number | null>(null);
  const [authGateError, setAuthGateError] = useState<string | null>(null);
  const [relanceBusy, setRelanceBusy] = useState(false);
  /** Retours utilisateur sur une proposition (clé = proposal id). */
  const [myActivityOutcomes, setMyActivityOutcomes] = useState<Record<string, ActivityFeedbackSentiment>>({});
  const [outcomeSubmitting, setOutcomeSubmitting] = useState(false);
  /** Genres + intentions des deux profils — règle du premier message texte. */
  const [pairChatMeta, setPairChatMeta] = useState<{
    myGender: string | null;
    myIntent: unknown;
    partnerGender: string | null;
    partnerIntent: unknown;
  } | null>(null);
  const [autoRelanceEnabled, setAutoRelanceEnabled] = useState(false);
  const [autoRelanceRunning, setAutoRelanceRunning] = useState(false);
  const { hasPlus } = usePremium(user?.id ?? null);

  const appendEmojiToDraft = useCallback((emoji: string) => {
    setDraftMessage((d) => d + emoji);
    setMessagePolicyError(null);
    requestAnimationFrame(() => chatMessageInputRef.current?.focus());
  }, []);

  const sharedSports = useMemo(() => {
    const fromState = navState?.sharedSports;
    if (fromState && fromState.length > 0) return fromState;
    if (!conversationId) return [];
    try {
      const raw = sessionStorage.getItem(`splove_conv_sports_${conversationId}`);
      if (raw) return JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    return [];
  }, [conversationId, navState?.sharedSports]);

  useEffect(() => {
    if (!conversationId) return;
    const saved = loadConversationMessageBubbleThemeFromStorage(conversationId);
    setChatAccentTheme(saved || CHAT_DEFAULT_ACCENT);
  }, [conversationId]);

  useEffect(() => {
    setChatOptionsOpen(false);
    setChatStyleOpen(false);
  }, [conversationId]);

  const chatAccentDef = getChatBubbleColorDef(chatAccentTheme);
  const chatSendButtonStyle = chatAccentDef.sendButton;
  const chatInputFocusClass = chatAccentDef.inputFocusClass;

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (conversationId) touchMatchOpenedAt(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const state = await getSplovePlusState(user.id);
      if (cancelled) return;
      setAutoRelanceEnabled(state.autoRelanceEnabled);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!modalOpen || !user?.id || !partnerUserId) {
      setSuggestedSlots([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("user_availability")
        .select("user_id, day_of_week, start_time, end_time")
        .in("user_id", [user.id, partnerUserId]);
      if (cancelled) return;
      if (error) {
        console.error("[Chat] user_availability fetch error:", error);
        setSuggestedSlots([]);
        return;
      }
      const rows = ((data ?? []) as AvailabilitySlot[]).filter(
        (r) => typeof r?.user_id === "string" && typeof r?.start_time === "string" && typeof r?.end_time === "string",
      );
      const next = buildOverlapSlotSuggestions(user.id, partnerUserId, rows);
      setSuggestedSlots(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, user?.id, partnerUserId]);

  useEffect(() => {
    if (authWatchdogRef.current != null) {
      window.clearTimeout(authWatchdogRef.current);
      authWatchdogRef.current = null;
    }
    if (!authLoading) {
      setAuthGateError(null);
      return;
    }
    authWatchdogRef.current = window.setTimeout(() => {
      if (!authLoading) return;
      console.error("[Chat loading] timeout watchdog triggered");
      const msg = "Chargement de session trop long. Vérifiez la connexion puis réessayez.";
      console.error("[Chat loading] setting error state:", msg);
      setAuthGateError(msg);
      setLoading(false);
      console.log("[Chat loading] setting loading false");
    }, 9000);
    return () => {
      if (authWatchdogRef.current != null) {
        window.clearTimeout(authWatchdogRef.current);
        authWatchdogRef.current = null;
      }
    };
  }, [authLoading]);

  const reloadProposals = useCallback(async (cid: string) => {
    console.log("[Chat] reloadProposals: start", { conversationId: cid });
    const rows = await listConversationProposals(cid);
    const latest = await getLatestProposalForConversation(cid);
    console.log("[Chat] reloadProposals: response", {
      conversationId: cid,
      rowCount: rows.length,
      proposalIds: rows.map((r) => r.id),
    });
    setProposals(rows);
    setLatestProposalTop(latest as ProposalRow | null);
    if (user?.id && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: od, error: oe } = await supabase
        .from("activity_participant_outcomes")
        .select("activity_proposal_id, sentiment")
        .eq("participant_id", user.id)
        .in("activity_proposal_id", ids);
      if (oe) {
        console.error("[Chat] reloadProposals: outcomes error (proposals still applied)", {
          conversationId: cid,
          message: oe.message,
          code: oe.code,
        });
        return;
      }
      const next: Record<string, ActivityFeedbackSentiment> = {};
      for (const row of od ?? []) {
        const r = row as { activity_proposal_id: string; sentiment: ActivityFeedbackSentiment };
        next[r.activity_proposal_id] = r.sentiment;
      }
      setMyActivityOutcomes(next);
    } else {
      setMyActivityOutcomes({});
    }
  }, [user?.id]);

  const reloadChatMessages = useCallback(
    async (cid: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from(CHAT_MESSAGES_TABLE)
        .select("id, body, sender_id, created_at, message_type, activity_proposal_id, metadata, payload")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: true });
      console.log("[Chat loading] messages result:", {
        conversationId: cid,
        ok: !error,
        count: (data as TextMessageRow[] | null)?.length ?? 0,
        error: error?.message ?? null,
      });
      if (error) {
        logSupabaseTableError(CHAT_MESSAGES_TABLE, "select", error);
        return error.message?.trim() || "Erreur lors du chargement des messages.";
      }
      setChatMessages((data as TextMessageRow[]) ?? []);
      if (user?.id) {
        const { error: rpcErr } = await supabase.rpc("mark_conversation_messages_read", {
          p_conversation_id: cid,
        });
        if (rpcErr) {
          console.warn("[Chat] mark_conversation_messages_read", rpcErr);
        }
        window.dispatchEvent(new CustomEvent(INBOX_REFRESH_EVENT));
      }
      return null;
    },
    [user?.id],
  );

  useEffect(() => {
    if (authLoading) return;
    const seq = ++chatLoadSeqRef.current;
    let cancelled = false;
    const clearWatchdog = () => {
      if (chatLoadWatchdogRef.current != null) {
        window.clearTimeout(chatLoadWatchdogRef.current);
        chatLoadWatchdogRef.current = null;
      }
    };

    clearWatchdog();
    chatLoadWatchdogRef.current = window.setTimeout(() => {
      if (cancelled) return;
      if (chatLoadSeqRef.current !== seq) return;
      console.error("[Chat loading] timeout watchdog triggered");
      const msg = "Le chargement de la session est trop long. Vérifiez votre connexion puis réessayez.";
      console.error("[Chat loading] setting error state:", msg);
      setLoadError(msg);
      setLoading(false);
      console.log("[Chat loading] setting loading false");
    }, 15000);

    async function load() {
      console.log("[Chat loading] conversationId:", conversationId ?? null);
      console.log("[Chat loading] currentUser:", user?.id ?? null);
      console.log("[Chat loading] start fetch");
      try {
        if (!conversationId) {
          const msg = "Aucun identifiant de session.";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!user?.id) {
          const msg = "Connectez-vous pour accéder à cette session.";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        setLoadError(null);
        setLoading(true);
        setChatMessages([]);
        setPairBlocked(false);
        setPartnerUserId(null);
        setPartnerPhotoVerified(false);
        setPairChatMeta(null);

        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .select("id, match_id")
          .eq("id", conversationId)
          .maybeSingle();
        console.log("[Chat loading] conversation result:", {
          ok: !convErr,
          hasConversation: Boolean(conv),
          matchId: (conv as { match_id?: string | null } | null)?.match_id ?? null,
          error: convErr?.message ?? null,
        });

        if (cancelled) return;

        if (convErr) {
          const msg = convErr.message?.trim() || "Erreur lors du chargement de la session (Supabase).";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!conv?.match_id) {
          const msg = "Session introuvable.";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const mid = conv.match_id as string;
        setChatMatchId(mid);

        const { data: mRow, error: mErr } = await supabase
          .from("matches")
          .select("id, user_a, user_b")
          .eq("id", mid)
          .maybeSingle();
        console.log("[Chat loading] access check result:", {
          ok: !mErr && Boolean(mRow),
          hasMatch: Boolean(mRow),
          userA: (mRow as { user_a?: string } | null)?.user_a ?? null,
          userB: (mRow as { user_b?: string } | null)?.user_b ?? null,
          error: mErr?.message ?? null,
        });

        if (cancelled) return;

        if (mErr) {
          const msg = mErr.message?.trim() || "Erreur lors du chargement du match (Supabase).";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!mRow) {
          const msg = "Session introuvable.";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const ua = (mRow as { user_a: string; user_b: string }).user_a;
        const ub = (mRow as { user_a: string; user_b: string }).user_b;
        if (user.id !== ua && user.id !== ub) {
          console.log("[Chat loading] access check result:", {
            ok: false,
            reason: "user not in match pair",
            currentUserId: user.id,
          });
          const msg = "Accès non autorisé.";
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const other = user.id === ua ? ub : ua;
        if (!cancelled) setPartnerUserId(other);

        const blocked = await isBlockedWith(other);
        if (!cancelled) setPairBlocked(blocked);

        const { data: pairProfiles } = await supabase
          .from("profiles")
          .select(
            "id, first_name, main_photo_url, portrait_url, avatar_url, is_photo_verified, photo_status, gender, intent",
          )
          .in("id", [user.id, other]);
        if (!cancelled && pairProfiles && pairProfiles.length > 0) {
          const mine = pairProfiles.find((r) => r.id === user.id) as
            | {
                gender?: string | null;
                intent?: unknown;
              }
            | undefined;
          const theirs = pairProfiles.find((r) => r.id === other) as
            | {
                first_name?: string | null;
                main_photo_url?: string | null;
                portrait_url?: string | null;
                avatar_url?: string | null;
                is_photo_verified?: boolean | null;
                photo_status?: string | null;
                gender?: string | null;
                intent?: unknown;
              }
            | undefined;
          if (theirs) {
            if (!partnerName && theirs.first_name?.trim()) setPartnerName(theirs.first_name.trim());
            const photo =
              theirs.main_photo_url?.trim() ||
              theirs.portrait_url?.trim() ||
              theirs.avatar_url?.trim() ||
              null;
            if (!partnerPhoto && photo) setPartnerPhoto(photo);
            setPartnerPhotoVerified(isPhotoVerified(theirs));
          }
          if (mine && theirs) {
            setPairChatMeta({
              myGender: mine.gender ?? null,
              myIntent: mine.intent,
              partnerGender: theirs.gender ?? null,
              partnerIntent: theirs.intent,
            });
          }
        }

        await ensureConversationWindow({
          conversationId,
          userId: user.id,
          matchedByUserId: navState?.matchedByUserId ?? null,
        });

        const { data: cw } = await supabase
          .from("conversation_windows")
          .select("window_expires_at")
          .eq("conversation_id", conversationId)
          .maybeSingle();
        const exp = (cw as { window_expires_at?: string | null } | null)?.window_expires_at;
        if (exp) setWindowExpiresAt(new Date(exp).getTime());

        const messagesLoadErr = await reloadChatMessages(conversationId);
        if (cancelled) return;
        if (messagesLoadErr) {
          console.log("[Chat loading] messages result:", { ok: false, error: messagesLoadErr });
          console.error("[Chat loading] setting error state:", messagesLoadErr);
          setLoadError(messagesLoadErr);
          return;
        }

        await reloadProposals(conversationId);
      } catch (e) {
        console.error("[Chat loading] caught error:", e);
        const message = e instanceof Error ? e.message : String(e);
        const msg = message.trim() ? message : "Une erreur est survenue pendant le chargement.";
        console.error("[Chat loading] setting error state:", msg);
        setLoadError(msg);
      } finally {
        clearWatchdog();
        if (chatLoadSeqRef.current === seq) {
          setLoading(false);
          console.log("[Chat loading] setting loading false");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearWatchdog();
    };
  }, [authLoading, conversationId, user?.id, navState?.matchedByUserId, reloadProposals, reloadChatMessages]);

  const scrollToProposalCard = useCallback((proposalId: string) => {
    requestAnimationFrame(() => {
      document.getElementById(`splove-proposal-${proposalId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, []);

  useEffect(() => {
    console.log("[Chat] proposals state snapshot", {
      conversationId: conversationId ?? null,
      count: proposals.length,
      statuses: proposals.map((p) => p.status ?? null),
    });
  }, [conversationId, proposals]);

  /** Rechargement pour l’autre participant : pas de refetch automatique sans écoute ou focus. */
  useEffect(() => {
    if (!conversationId || authLoading) return;
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = supabase
      .channel(`activity_proposals:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_proposals", filter },
        (payload) => {
          console.log("[Chat] realtime activity_proposals", {
            event: payload.eventType,
            conversationId,
          });
          void reloadProposals(conversationId);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Chat] realtime subscribed", { table: "activity_proposals", conversationId });
        }
        if (status === "CHANNEL_ERROR") {
          console.error("[Chat] realtime channel error", { table: "activity_proposals", conversationId });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, authLoading, reloadProposals]);

  useEffect(() => {
    if (!conversationId || authLoading) return;
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: CHAT_MESSAGES_TABLE, filter },
        () => {
          void reloadChatMessages(conversationId);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[Chat] realtime channel error", { table: CHAT_MESSAGES_TABLE, conversationId });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, authLoading, reloadChatMessages]);

  const sendTypingStop = useCallback(async () => {
    if (!conversationId || !user?.id || conversationTypingDisabled) return;
    const { error } = await supabase.from("conversation_typing").upsert(
      {
        conversation_id: conversationId,
        user_id: user.id,
        updated_at: TYPING_SENTINEL_ISO,
      },
      { onConflict: "conversation_id,user_id" },
    );
    if (error) {
      const msg = `${error.message ?? ""} ${(error as { code?: string }).code ?? ""}`.toLowerCase();
      if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("42p01")) {
        setConversationTypingDisabled(true);
        setPartnerTypingUntil(0);
      } else {
        console.warn("[Chat] conversation_typing stop", error);
      }
    }
  }, [conversationId, user?.id, conversationTypingDisabled]);

  const scheduleTypingPulse = useCallback(() => {
    if (!conversationId || !user?.id || pairBlocked || conversationTypingDisabled) return;
    if (typingPulseTimerRef.current != null) window.clearTimeout(typingPulseTimerRef.current);
    typingPulseTimerRef.current = window.setTimeout(() => {
      typingPulseTimerRef.current = null;
      void (async () => {
        const { error } = await supabase.from("conversation_typing").upsert(
          {
            conversation_id: conversationId,
            user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id,user_id" },
        );
        if (error) {
          const msg = `${error.message ?? ""} ${(error as { code?: string }).code ?? ""}`.toLowerCase();
          if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("42p01")) {
            setConversationTypingDisabled(true);
            setPartnerTypingUntil(0);
          }
        }
      })();
    }, TYPING_PULSE_DEBOUNCE_MS);

    if (typingStopTimerRef.current != null) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      typingStopTimerRef.current = null;
      void sendTypingStop();
    }, TYPING_IDLE_STOP_MS);
  }, [conversationId, user?.id, pairBlocked, conversationTypingDisabled, sendTypingStop]);

  useEffect(() => {
    return () => {
      if (typingPulseTimerRef.current != null) {
        window.clearTimeout(typingPulseTimerRef.current);
        typingPulseTimerRef.current = null;
      }
      if (typingStopTimerRef.current != null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (conversationId && user?.id && !conversationTypingDisabled) {
        void supabase.from("conversation_typing").upsert(
          {
            conversation_id: conversationId,
            user_id: user.id,
            updated_at: TYPING_SENTINEL_ISO,
          },
          { onConflict: "conversation_id,user_id" },
        );
      }
    };
  }, [conversationId, user?.id, conversationTypingDisabled]);

  useEffect(() => {
    if (!conversationId || authLoading || !user?.id || conversationTypingDisabled) return;
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = supabase
      .channel(`conversation_typing:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_typing", filter },
        (payload) => {
          const row = payload.new as { user_id?: string; updated_at?: string } | null;
          if (!row?.user_id || !row.updated_at || row.user_id === user.id) return;
          const t = new Date(row.updated_at).getTime();
          if (Number.isNaN(t)) return;
          const age = Date.now() - t;
          if (age < 0 || age > TYPING_PARTNER_VISIBLE_MS) {
            setPartnerTypingUntil(0);
            return;
          }
          setPartnerTypingUntil(Date.now() + TYPING_PARTNER_VISIBLE_MS);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, authLoading, user?.id, conversationTypingDisabled]);

  useEffect(() => {
    if (partnerTypingUntil <= 0) return;
    const id = window.setInterval(() => {
      if (Date.now() >= partnerTypingUntil) setPartnerTypingUntil(0);
    }, 400);
    return () => window.clearInterval(id);
  }, [partnerTypingUntil]);

  useEffect(() => {
    if (!conversationId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        console.log("[Chat] visibility refresh proposals", { conversationId });
        void reloadProposals(conversationId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId, reloadProposals]);

  const sortedProposalsDesc = useMemo(
    () =>
      [...proposals].sort(
        (a, b) => parseCreatedMs(b.created_at) - parseCreatedMs(a.created_at),
      ),
    [proposals],
  );
  const hasPendingProposal = sortedProposalsDesc.some((p) => isPendingProposalStatus(p.status));
  const pendingProposal = useMemo(
    () => sortedProposalsDesc.find((p) => isPendingProposalStatus(p.status)) ?? null,
    [sortedProposalsDesc],
  );
  const hasAcceptedProposal = useMemo(
    () => sortedProposalsDesc.some((p) => normalizeProposalStatus(p) === "accepted"),
    [sortedProposalsDesc],
  );
  const latestProposal = latestProposalTop ?? sortedProposalsDesc[0] ?? null;
  const productState = getProductState({ hasProposal: hasPendingProposal });

  useEffect(() => {
    if (pendingProposal?.id) console.log("[Chat] active proposal id", pendingProposal.id);
  }, [pendingProposal?.id]);
  const matchOpenedAt = conversationId ? getMatchOpenedAt(conversationId) : null;

  const chatSessionPhase = useMemo((): ChatSessionPhase => {
    if (pairBlocked) return "inactive";
    const baseExpiresAt =
      windowExpiresAt ?? (matchOpenedAt != null ? matchOpenedAt + CHAT_WINDOW_HOURS_MS : null);
    const windowExpired = baseExpiresAt != null && nowTick >= baseExpiresAt;
    if (windowExpired) return "inactive";
    if (chatMessages.length === 0 && proposals.length === 0) return "new_match";
    return "active_chat";
  }, [
    pairBlocked,
    windowExpiresAt,
    matchOpenedAt,
    nowTick,
    chatMessages.length,
    proposals.length,
  ]);

  const proposalWindowRemainingLabel = useMemo(() => {
    const baseExpiresAt =
      windowExpiresAt ?? (matchOpenedAt != null ? matchOpenedAt + CHAT_WINDOW_HOURS_MS : null);
    if (baseExpiresAt == null) return null;
    const remainingMs = Math.max(0, baseExpiresAt - nowTick);
    if (remainingMs <= 0) return "Fenêtre de proposition expirée";
    const remainingHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
    return `${remainingHours}h restantes pour proposer une activité`;
  }, [windowExpiresAt, matchOpenedAt, nowTick]);

  const sharedSportsLine = useMemo(() => {
    if (sharedSports.length === 0) return "Sport en commun à définir";
    return sharedSports.join(" • ");
  }, [sharedSports]);

  const canSendChatText = useMemo(() => {
    if (!user?.id || !partnerUserId || !pairChatMeta) return true;
    return canUserSendChatTextMessage({
      messageCount: chatMessages.length,
      myGender: pairChatMeta.myGender,
      myIntent: pairChatMeta.myIntent,
      partnerGender: pairChatMeta.partnerGender,
      partnerIntent: pairChatMeta.partnerIntent,
    });
  }, [user?.id, partnerUserId, pairChatMeta, chatMessages.length]);

  const proposalStatusLabel = useMemo(() => {
    if (hasAcceptedProposal) return "Une rencontre est déjà planifiée";
    if (pendingProposal) return "Un créneau est déjà en attente";
    return null;
  }, [pendingProposal, hasAcceptedProposal]);
  const pendingWithoutResponse = useMemo(() => {
    if (!pendingProposal) return false;
    const createdMs = parseCreatedMs(pendingProposal.created_at);
    if (!createdMs) return false;
    return Date.now() - createdMs >= 2 * 60 * 60 * 1000;
  }, [pendingProposal]);

  /** Proposition la plus récente éligible au retour (créneau passé + délai), sans re-demander si déjà répondu. */
  const feedbackEligibleProposal = useMemo(() => {
    if (pairBlocked || proposals.length === 0) return null;
    const now = nowTick;
    const sorted = [...proposals].sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
    for (const p of sorted) {
      if (myActivityOutcomes[p.id]) continue;
      const st = normalizeProposalStatus(p);
      if (
        st === "declined" ||
        st === "expired" ||
        st === "reschedule_requested" ||
        st === "replaced" ||
        st === "countered" ||
        st === "cancelled"
      )
        continue;
      const sched = p.created_at ? new Date(p.created_at).getTime() + CHAT_WINDOW_HOURS_MS : 0;
      if (sched <= 0 || now < sched + ACTIVITY_FEEDBACK_DELAY_MS) continue;
      return p;
    }
    return null;
  }, [proposals, myActivityOutcomes, nowTick, pairBlocked]);

  const proposalsById = useMemo(() => {
    const m = new Map<string, ProposalRow>();
    for (const p of proposals) m.set(p.id, p);
    return m;
  }, [proposals]);

  const proposalDetailActions = useMemo(() => {
    if (!proposalDetail || !user?.id) return null;
    return getAvailableProposalActions(
      buildProposalRulesContext({
        proposal: proposalDetail,
        currentUserId: user.id,
        conversationReady: Boolean(conversationId && user.id),
        pairBlocked,
      }),
    );
  }, [proposalDetail, user?.id, conversationId, pairBlocked]);

  const proposalActionBusy = proposalActionInFlightId !== null;

  const chatTimeline = useMemo((): ChatTimelineItem[] => {
    const cid = conversationId ?? "";
    const latestProposalId = sortedProposalsDesc[0]?.id ?? null;
    const linkedIds = new Set<string>();
    const fromMessages: ChatTimelineItem[] = chatMessages.map((msg) => {
      const createdMs = parseCreatedMs(msg.created_at);
      const sortKey = `m:${msg.id}`;
      const mt = msg.message_type ?? "text";
      if (mt === "activity_proposal" && msg.activity_proposal_id) {
        linkedIds.add(msg.activity_proposal_id);
        const fromDb = proposalsById.get(msg.activity_proposal_id);
        const proposal = buildActivityProposalRowForRender(msg, cid, fromDb) as ProposalRow | null;
        if (!proposal) {
          return { kind: "message" as const, sortKey, createdMs, message: msg };
        }
        return { kind: "proposal" as const, sortKey, createdMs, proposal };
      }
      return { kind: "message" as const, sortKey, createdMs, message: msg };
    });
    const orphanProposals: ChatTimelineItem[] = proposals
      .filter((p) => !linkedIds.has(p.id) && (!latestProposalId || p.id === latestProposalId))
      .map((p) => ({
        kind: "proposal" as const,
        sortKey: `p:${p.id}`,
        createdMs: parseCreatedMs(p.created_at),
        proposal: p,
      }));
    const items = [...fromMessages, ...orphanProposals];
    items.sort((a, b) => {
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      if (a.kind !== b.kind) return a.kind === "message" ? -1 : 1;
      return a.sortKey.localeCompare(b.sortKey);
    });
    return items;
  }, [chatMessages, proposals, proposalsById, conversationId, sortedProposalsDesc]);

  async function sendActivity(payload: ActivityPayload, replaceProposalId: string | null = null) {
    if (!user?.id || !conversationId || !chatMatchId) throw new Error("Non connecté");
    if (pairBlocked) throw new Error("Échange impossible avec ce profil.");
    if (proposalActionInFlightId !== null) throw new Error("Une action est déjà en cours.");

    const notePrefix = hasPlus ? "[Proposition prioritaire SPLove+] " : "";
    const note = `${notePrefix}${payload.message.trim()}`.trim();
    const pl = payload.place.trim();
    if (messageContainsDisallowedContent(note) || (pl.length > 0 && messageContainsDisallowedContent(pl))) {
      throw new Error(SAFETY_CONTENT_REFUSAL);
    }

    const fallbackSchedule = computeProposalSchedule(payload.when);
    const scheduledAtIso = payload.scheduledAt?.trim() || fallbackSchedule.scheduledAt;
    const timeLabel = (() => {
      if (!scheduledAtIso) return fallbackSchedule.timeLabel;
      const d = new Date(scheduledAtIso);
      if (Number.isNaN(d.getTime())) return fallbackSchedule.timeLabel;
      return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
    })();
    const loc = payload.place.trim() || "À définir";

    if (replaceProposalId) {
      const prev = proposals.find((x) => x.id === replaceProposalId);
      if (!prev) {
        if (import.meta.env.DEV) console.debug("[Chat] sendActivity counter: proposal not found", replaceProposalId);
        throw new Error("Proposition introuvable.");
      }
      const ctx = buildProposalRulesContext({
        proposal: prev,
        currentUserId: user.id,
        conversationReady: Boolean(conversationId && user.id),
        pairBlocked,
      });
      const gate = assertProposalActionAllowed("counter", ctx);
      if (!gate.ok) {
        if (import.meta.env.DEV) console.debug("[Chat] sendActivity counter blocked", gate.reason);
        throw new Error(gate.reason);
      }
    }

    const lockId = replaceProposalId ?? "__create__";
    setProposalActionInFlightId(lockId);
    try {
      if (replaceProposalId) {
        await requestConversationProposalReschedule({
          proposalId: replaceProposalId,
          conversationId,
          proposerId: user.id,
          matchId: chatMatchId,
          sport: payload.sport,
          timeSlot: timeLabel,
          location: loc,
          note: payload.message.trim() || null,
        });
      } else {
        await createConversationProposal({
          conversationId,
          proposerId: user.id,
          matchId: chatMatchId,
          sport: payload.sport,
          timeSlot: timeLabel,
          location: loc,
          note: payload.message.trim() || null,
        });
      }

      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
    } finally {
      setProposalActionInFlightId(null);
    }
  }

  async function handleAutoRelance() {
    if (!user?.id || !conversationId || !pendingProposal || autoRelanceRunning) return;
    if (!autoRelanceEnabled || !hasPlus) {
      setMessagePolicyError("La relance automatique est reservee a SPLove+.");
      return;
    }
    if (hasAutoRelanceBeenSent(user.id, pendingProposal.id)) return;

    setAutoRelanceRunning(true);
    const { error } = await supabase.from(CHAT_MESSAGES_TABLE).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: "Relance SPLove+ : je te remets la proposition en haut, dis-moi si ce creneau te va 🙂",
    });
    setAutoRelanceRunning(false);

    if (error) {
      setMessagePolicyError("Relance impossible pour le moment.");
      return;
    }
    markAutoRelanceSent(user.id, pendingProposal.id);
    await reloadChatMessages(conversationId);
  }

  async function submitActivityOutcome(proposalId: string, sentiment: ActivityFeedbackSentiment) {
    if (!user?.id || outcomeSubmitting) return;
    setOutcomeSubmitting(true);
    try {
      const { error } = await supabase.from("activity_participant_outcomes").insert({
        activity_proposal_id: proposalId,
        participant_id: user.id,
        activity_done: true,
        sentiment,
      });
      if (error) {
        console.warn("[Chat] activity_participant_outcomes", error);
        return;
      }
      setMyActivityOutcomes((prev) => ({ ...prev, [proposalId]: sentiment }));
    } finally {
      setOutcomeSubmitting(false);
    }
  }

  async function sendChatMessage() {
    if (!user?.id || !conversationId) return;
    if (pairBlocked) {
      setMessagePolicyError("Échange impossible avec ce profil.");
      return;
    }
    if (!canSendChatText) {
      setMessagePolicyError(CHAT_FIRST_MESSAGE_HINT_HOMME);
      return;
    }
    const text = draftMessage.trim();
    if (!text) return;
    if (messageContainsDisallowedContent(text)) {
      setMessagePolicyError(SAFETY_CONTENT_REFUSAL);
      return;
    }
    setMessagePolicyError(null);
    setSendingMessage(true);
    await sendTypingStop();
    const { error } = await supabase.from(CHAT_MESSAGES_TABLE).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: text,
    });
    setSendingMessage(false);
    if (error) {
      logSupabaseTableError(CHAT_MESSAGES_TABLE, "insert", error);
      const msg = (error.message ?? "").toLowerCase();
      if (error.code === "23514" || /contenu non autorisé|splove:/i.test(msg)) {
        setMessagePolicyError(SAFETY_CONTENT_REFUSAL);
      }
      return;
    }
    setDraftMessage("");
    await reloadChatMessages(conversationId);
  }

  function handleAddClick() {
    console.log("[Chat] add clicked");
    if (!user?.id || !conversationId) {
      console.error("[Chat] add blocked reason", "notReady");
      return;
    }
    if (pairBlocked) {
      console.error("[Chat] add blocked reason", "pairBlocked");
      setMessagePolicyError("Échange impossible avec ce profil.");
      return;
    }
    if (!canSendChatText) {
      console.error("[Chat] add blocked reason", "firstMessagePolicy");
      setMessagePolicyError(CHAT_FIRST_MESSAGE_HINT_HOMME);
      return;
    }
    const text = draftMessage.trim();
    if (!text) {
      console.error("[Chat] add blocked reason", "emptyDraft");
      setMessagePolicyError("Écrivez un message avant d’envoyer.");
      return;
    }
    console.log("[Chat] add payload", { body: text, conversationId, senderId: user.id });
    void sendChatMessage();
  }

  async function respondToProposal(proposalId: string, status: "accepted" | "declined" | "cancelled") {
    if (!user?.id || !conversationId) return;
    if (proposalActionInFlightId !== null) return;

    const p = proposals.find((x) => x.id === proposalId);
    if (!p) {
      setMessagePolicyError("Proposition introuvable.");
      return;
    }
    const ctx = buildProposalRulesContext({
      proposal: p,
      currentUserId: user.id,
      conversationReady: Boolean(conversationId && user.id),
      pairBlocked,
    });
    const action = status === "accepted" ? "accept" : status === "declined" ? "decline" : "cancel";
    const gate = assertProposalActionAllowed(action, ctx);
    if (!gate.ok) {
      if (import.meta.env.DEV) console.debug("[Chat] respondToProposal blocked", gate.reason);
      setMessagePolicyError(gate.reason);
      return;
    }

    setProposalActionInFlightId(proposalId);
    try {
      if (status === "accepted") {
        await acceptConversationProposal(proposalId);
      } else if (status === "declined") {
        await declineConversationProposal(proposalId);
      } else {
        await cancelConversationProposal(proposalId);
      }
      setProposalDetail(null);
      setMessagePolicyError(null);
      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
    } catch (e) {
      setMessagePolicyError(e instanceof Error ? e.message : genericProposalError());
    } finally {
      setProposalActionInFlightId(null);
    }
  }

  async function handleBlockPartner() {
    if (!user?.id || !partnerUserId || blockPartnerInFlightRef.current) return;
    if (!window.confirm(BLOCK_PROFILE_CONFIRM)) return;
    blockPartnerInFlightRef.current = true;
    try {
      const { error } = await insertBlock(user.id, partnerUserId);
      if (error) {
        console.error("[Chat] block partner:", error);
        return;
      }
      navigate("/messages", { replace: true });
    } finally {
      blockPartnerInFlightRef.current = false;
    }
  }

  async function handleRelanceWindow() {
    if (!conversationId) return;
    setRelanceBusy(true);
    const newExp = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("conversation_windows")
      .update({ window_expires_at: newExp })
      .eq("conversation_id", conversationId);
    setRelanceBusy(false);
    if (error) {
      console.error("[Chat] conversation_windows relance:", error);
      return;
    }
    setWindowExpiresAt(new Date(newExp).getTime());
  }

  function handleProposeActivityClick() {
    if (pairBlocked) return;
    if (hasPendingProposal && pendingProposal) {
      scrollToProposalCard(pendingProposal.id);
      return;
    }
    if (hasAcceptedProposal) {
      setMessagePolicyError("Une activité est déjà confirmée dans cette conversation.");
      return;
    }
    setModalOpen(true);
  }

  if (!conversationId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">Aucun identifiant de session.</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          Retour à Découvrir
        </Link>
      </div>
    );
  }

  if (authLoading && !authGateError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg p-6 font-sans">
        <p className="text-sm text-app-muted">Chargement de la session…</p>
      </div>
    );
  }

  if (authGateError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{authGateError}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          Retour à Découvrir
        </Link>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">Connectez-vous pour accéder à cette session.</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          Retour à Découvrir
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg p-6 font-sans">
        <p className="text-sm text-app-muted">Chargement de la session…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          Retour à Découvrir
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <header className="relative shrink-0 border-b border-app-border/80 bg-app-card px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Link
            to="/discover"
            className="text-[13px] font-semibold text-[#FF1E2D] underline-offset-2 hover:underline"
          >
            Retour à Découvrir
          </Link>
          <button
            type="button"
            onClick={() => {
              setChatOptionsOpen((v) => !v);
              setChatStyleOpen(false);
            }}
            aria-expanded={chatOptionsOpen}
            aria-label="Options de la discussion"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-app-bg text-app-muted transition hover:bg-app-border hover:text-app-text"
          >
            <span className="text-base leading-none">•••</span>
          </button>
        </div>
        {chatOptionsOpen ? (
          <div className="absolute right-4 top-12 z-20 w-[230px] rounded-2xl border border-app-border/90 bg-app-card p-2 shadow-xl ring-1 ring-white/[0.05]">
            <button
              type="button"
              onClick={() => setChatStyleOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium text-app-text transition hover:bg-app-border/50"
            >
              <span>Style de discussion</span>
              <span className="text-app-muted">{chatStyleOpen ? "−" : "+"}</span>
            </button>
            {chatStyleOpen ? (
              <div className="mt-1 space-y-2 rounded-xl bg-app-bg/80 px-2 py-2">
                <p className="px-1 text-[11px] leading-snug text-app-muted">
                  Tes messages à toi dans cette conversation ; le reste reste sobre.
                </p>
                <div className="space-y-1">
                  {CHAT_ACCENT_OPTIONS.map((opt) => {
                    const active = chatAccentTheme === opt;
                    const optDef = getChatBubbleColorDef(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (!conversationId) return;
                          setChatAccentTheme(opt);
                          saveConversationMessageBubbleThemeToStorage(conversationId, opt);
                          setChatOptionsOpen(false);
                          setChatStyleOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[12px] transition ${
                          active
                            ? "bg-app-border/70 text-app-text"
                            : "text-app-muted hover:bg-app-border/40 hover:text-app-text"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${optDef.dotClass}`} />
                          {optDef.label}
                        </span>
                        {active ? <span className="text-[11px]">Actif</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto mt-2 flex max-w-md items-center gap-3">
          {partnerPhoto ? (
            <img
              src={partnerPhoto}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-app-border"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-full bg-app-border ring-2 ring-app-border" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Session</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold text-app-text">
                {partnerName ? `Avec ${partnerName}` : "Sortie à organiser"}
              </h1>
              {partnerPhotoVerified ? <VerifiedBadge variant="compact" /> : null}
            </div>
            <p className="mt-1 truncate text-[12px] text-app-muted">{sharedSportsLine}</p>
            {proposalWindowRemainingLabel ? (
              <p className="mt-0.5 text-[11px] font-medium text-app-muted">{proposalWindowRemainingLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleProposeActivityClick}
            disabled={pairBlocked || hasAcceptedProposal}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:opacity-60"
            style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
          >
            {hasPlus ? "+ Proposer (prioritaire)" : "+ Proposer"}
          </button>
        </div>
        {partnerUserId && user?.id ? (
          <div className="mx-auto mt-1 flex max-w-md flex-wrap justify-end gap-x-4 gap-y-1 px-0">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="text-[12px] font-medium text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-muted"
            >
              {REPORT_LINK_LABEL}
            </button>
            {!pairBlocked ? (
              <button
                type="button"
                onClick={() => void handleBlockPartner()}
                className="text-[12px] font-medium text-app-muted underline decoration-app-border underline-offset-2 hover:text-app-muted"
              >
                {BLOCK_PROFILE_LINK_LABEL}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 py-4">
        {pairBlocked ? (
          <p className="mb-3 rounded-xl border border-app-border bg-app-border/90 px-3 py-2.5 text-sm leading-snug text-app-text">
            Vous ne pouvez plus organiser de sortie avec cette personne.
          </p>
        ) : null}
        {!pairBlocked ? (
          <div className="mb-3 rounded-2xl border border-app-border/90 bg-app-bg/90 px-4 py-3 shadow-sm ring-1 ring-white/[0.05]">
            {chatSessionPhase === "new_match" ? (
              <>
                <p className="text-[13px] font-semibold leading-snug text-app-text">Message système</p>
                <p className="mt-1 text-[12px] leading-relaxed text-app-muted">
                  Vous avez matché 🎯 Vous avez 48h pour proposer une activité autour d’un sport en commun.
                </p>
                <button
                  type="button"
                  onClick={handleProposeActivityClick}
                  className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition hover:opacity-95"
                  style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
                >
                  Proposer une activité
                </button>
              </>
            ) : chatSessionPhase === "active_chat" ? (
              <p className="text-[13px] leading-snug">
                <span className="font-semibold text-app-text">Échange en cours.</span>{" "}
                <span className="text-app-muted">Proposez un créneau quand vous êtes prêts.</span>
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-app-muted">
                Fenêtre privilégiée passée — vous pouvez encore écrire ou relancer la rencontre depuis le bloc
                ci-dessous.
              </p>
            )}
          </div>
        ) : null}
        {!pairBlocked && chatSessionPhase === "new_match" && !hasPlus ? (
          <PriorityProposalUpsell
            onActivate={() => navigate("/splove-plus")}
            onStayFree={() => {
              // Upsell non bloquant.
            }}
          />
        ) : null}
        {!pairBlocked && pendingWithoutResponse ? (
          <div className="mb-3 rounded-2xl border border-app-border/80 bg-app-card px-4 py-3 shadow-sm">
            <p className="text-[12px] leading-snug text-app-muted">
              Trigger inactivite : la proposition attend une reponse.{" "}
              {hasPlus ? "Tu peux lancer une relance auto." : "SPLove+ peut relancer automatiquement."}
            </p>
            {hasPlus ? (
              <button
                type="button"
                disabled={autoRelanceRunning || !autoRelanceEnabled}
                onClick={() => void handleAutoRelance()}
                className="mt-2 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-text disabled:opacity-50"
              >
                {autoRelanceRunning ? "Relance..." : "Relance automatique"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/splove-plus")}
                className="mt-2 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-text"
              >
                Decouvrir SPLove+
              </button>
            )}
          </div>
        ) : null}
        {!pairBlocked && hasAcceptedProposal ? (
          <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-950/35 px-4 py-3 text-center shadow-sm ring-1 ring-emerald-400/10">
            <p className="text-[13px] font-semibold text-emerald-100">Activité confirmée ✅</p>
            <Link
              to="/mes-rencontres"
              className="mt-2 inline-flex rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
            >
              Voir dans Mes rencontres
            </Link>
          </div>
        ) : null}
        <ChatPostMatchPanel
          productState={productState}
          matchOpenedAt={matchOpenedAt}
          windowExpiresAt={windowExpiresAt}
          nowTick={nowTick}
          onProposeClick={() => {
            if (hasPendingProposal) {
              console.error("[Chat] add blocked", "pendingProposalExists");
              setMessagePolicyError(
                "Un créneau est déjà en attente. Répondez sur la carte ou proposez un autre moment.",
              );
              return;
            }
            setModalOpen(true);
          }}
          proposeDisabled={hasPendingProposal || hasAcceptedProposal || pairBlocked}
          proposalStatusLabel={proposalStatusLabel}
          hideCardProposeButton
          onRelanceWindow={handleRelanceWindow}
          relanceBusy={relanceBusy}
          onActivityBannerClick={
            pendingProposal
              ? () => {
                  console.log("[Chat] active proposal clicked", pendingProposal.id);
                  scrollToProposalCard(pendingProposal.id);
                }
              : undefined
          }
        />

        {feedbackEligibleProposal && !pairBlocked ? (
          <div className="mb-3 rounded-2xl border border-app-border/70 bg-app-card/90 px-3 py-2.5 shadow-sm ring-1 ring-white/[0.04]">
            <p className="text-[11px] font-medium leading-snug text-app-muted">
              Un mot sur votre sortie ? Optionnel — ça aide à faire remonter les profils impliqués.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { s: "positive" as const, label: "👍 Bien passé" },
                  { s: "neutral" as const, label: "😐 Mitigé" },
                  { s: "negative" as const, label: "👎 Pas ouf" },
                ] as const
              ).map(({ s, label }) => (
                <button
                  key={s}
                  type="button"
                  disabled={outcomeSubmitting}
                  onClick={() => void submitActivityOutcome(feedbackEligibleProposal.id, s)}
                  className="rounded-full border border-app-border/90 bg-app-bg px-3 py-1.5 text-[11px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {latestProposal ? (
          <div className="mb-3">
            <ProposalCard
              proposal={latestProposal}
              currentUserId={user?.id}
              conversationReady={Boolean(conversationId && user?.id)}
              pairBlocked={pairBlocked}
              mine={latestProposal.proposer_id === user?.id}
              proposalActionLocked={proposalActionBusy}
              onOpenDetail={() => setProposalDetail(latestProposal)}
              onAccept={() => void respondToProposal(latestProposal.id, "accepted")}
              onDecline={() => void respondToProposal(latestProposal.id, "declined")}
              onCounter={() => {
                setCounterReplaceProposalId(latestProposal.id);
                setCounterPrefill({
                  sport: latestProposal.sport?.trim() || "",
                  place: latestProposal.location?.trim() || "",
                });
                setModalOpen(true);
              }}
              onCancel={() => void respondToProposal(latestProposal.id, "cancelled")}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!pairBlocked) setModalOpen(true);
            }}
            disabled={pairBlocked}
            className="mb-3 w-full rounded-xl border border-app-border bg-app-card py-3 text-sm font-semibold text-app-text shadow-sm transition hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proposer une activité
          </button>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
          {chatTimeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-app-border bg-app-card/80 px-4 py-8 text-center">
              <p className="text-sm leading-relaxed text-app-muted">
                Ajoutez un détail pour lancer la sortie — proposer un vrai créneau reste possible quand vous voulez.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {chatTimeline.map((item) => {
                if (item.kind === "message") {
                  const m = item.message;
                  const mine = m.sender_id === user?.id;
                  const mt = m.message_type ?? "text";
                  if (mt === "activity_proposal_response") {
                    return <ActivityResponseBubble key={item.sortKey} message={m} />;
                  }
                  return (
                    <div
                      key={item.sortKey}
                      className={
                        mine
                          ? `chat-message-bubble ml-auto ${getOwnMessageBubbleClassName(chatAccentTheme)}`
                          : "chat-message-bubble mr-auto max-w-[85%] rounded-2xl border border-app-border bg-app-card px-3.5 py-2.5 text-sm leading-snug text-app-text shadow-sm"
                      }
                    >
                      {m.body}
                    </div>
                  );
                }
                const p = item.proposal;
                const mine = p.proposer_id === user?.id;
                return (
                  <ActivityProposalBubble
                    key={item.sortKey}
                    proposal={p}
                    currentUserId={user?.id}
                    conversationReady={Boolean(conversationId && user?.id)}
                    pairBlocked={pairBlocked}
                    mine={mine}
                    proposalActionLocked={proposalActionBusy}
                    onOpenDetail={() => setProposalDetail(p)}
                    onAccept={() => void respondToProposal(p.id, "accepted")}
                    onDecline={() => void respondToProposal(p.id, "declined")}
                    onCounter={() => {
                      setCounterReplaceProposalId(p.id);
                      setCounterPrefill({
                        sport: p.sport?.trim() || "",
                        place: p.location?.trim() || "",
                      });
                      setModalOpen(true);
                    }}
                    onCancel={() => void respondToProposal(p.id, "cancelled")}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-app-border/80 bg-app-bg pt-3">
          {!pairBlocked && partnerName && partnerTypingUntil > Date.now() ? (
            <p className="text-[12px] italic leading-snug text-app-muted" aria-live="polite">
              {partnerName} est en train d’écrire…
            </p>
          ) : null}
          {!canSendChatText && chatMessages.length === 0 ? (
            <p className="rounded-xl border border-app-border/90 bg-app-card px-3 py-2.5 text-[13px] leading-relaxed text-app-muted">
              {CHAT_FIRST_MESSAGE_HINT_HOMME}
            </p>
          ) : null}
          {!pairBlocked && canSendChatText ? (
            <div className="flex flex-wrap gap-2" aria-label="Suggestions de messages">
              {CHAT_QUICK_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraftMessage(s);
                    setMessagePolicyError(null);
                    requestAnimationFrame(() => chatMessageInputRef.current?.focus());
                  }}
                  className="rounded-full border border-app-border/90 bg-app-card px-3 py-1.5 text-left text-[12px] font-medium leading-snug text-app-muted transition hover:border-app-accent/35 hover:text-app-text"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-end gap-2">
              <ChatEmojiPicker
                disabled={sendingMessage || !canSendChatText}
                onEmojiSelect={(emoji) => appendEmojiToDraft(emoji)}
              />
              <textarea
                ref={chatMessageInputRef}
                value={draftMessage}
                onChange={(e) => {
                  setDraftMessage(e.target.value);
                  setMessagePolicyError(null);
                  scheduleTypingPulse();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddClick();
                  }
                }}
                placeholder="Ajoutez un détail pour la sortie…"
                rows={2}
                disabled={sendingMessage || pairBlocked || !canSendChatText}
                enterKeyHint="send"
                autoComplete="off"
                className={`min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm text-app-text placeholder:text-app-muted transition-opacity duration-200 focus:outline-none focus:ring-1 disabled:opacity-60 ${chatInputFocusClass}`}
              />
            </div>
            <button
              type="button"
              onClick={() => handleAddClick()}
              disabled={sendingMessage}
              className="group shrink-0 self-end flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: chatSendButtonStyle.bg, color: chatSendButtonStyle.text }}
            >
              <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
                <IconSend
                  size={18}
                  color="currentColor"
                  className="transition-opacity duration-150 ease-out group-active:opacity-80"
                />
              </span>
              Ajouter
            </button>
          </div>
          {messagePolicyError ? (
            <p
              role="alert"
              className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[13px] leading-snug text-amber-100"
            >
              {messagePolicyError}
            </p>
          ) : null}
          {hasPendingProposal || hasAcceptedProposal ? (
            <p className="rounded-xl border border-app-border/80 bg-app-card/80 px-3 py-2.5 text-center text-[12px] leading-snug text-app-muted">
              {hasAcceptedProposal
                ? "Une rencontre est déjà planifiée — vous ne pouvez pas proposer un autre créneau ici."
                : "Un créneau est déjà en attente de réponse."}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (pairBlocked) return;
                setModalOpen(true);
              }}
              disabled={pairBlocked}
              className="w-full rounded-xl border border-app-border bg-app-card py-3 text-sm font-semibold text-app-text shadow-sm transition hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-50"
            >
              Proposer une activité
            </button>
          )}
        </div>
      </main>

      {proposalDetail ? (
        <div
          className="fixed inset-0 z-[101] flex items-end justify-center bg-slate-900/40 px-3 pb-0 pt-10 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proposal-detail-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setProposalDetail(null);
          }}
        >
          <div
            className="mb-safe max-h-[min(88vh,560px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-app-card shadow-2xl ring-1 ring-app-border/80 sm:rounded-3xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-app-border/80 px-4 py-3">
              <h2 id="proposal-detail-title" className="text-base font-bold text-app-text">
                Détail de la proposition
              </h2>
              {proposalDetail.supersedes_proposal_id ? (
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#FF1E2D]/90">
                  Contre-proposition
                </p>
              ) : null}
              <p className="mt-0.5 text-[12px] text-app-muted">{proposalStatusLabelFr(proposalDetail)}</p>
            </div>
            <div className="space-y-3 px-4 py-4 text-app-text">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Activité</p>
                <p className="mt-0.5 text-[15px] font-semibold">{proposalDetail.sport}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Quand</p>
                <p className="mt-0.5 text-sm">{formatProposalWhenLine(proposalDetail)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Lieu</p>
                <p className="mt-0.5 text-sm">{proposalDetail.location?.trim() || "—"}</p>
              </div>
              {proposalDetail.note?.trim() ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Message</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">{proposalDetail.note}</p>
                </div>
              ) : null}
              {user?.id && normalizeProposalStatus(proposalDetail) === "accepted" ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-emerald-200/95">✅ Accepté</p>
                </div>
              ) : null}
              {user?.id && normalizeProposalStatus(proposalDetail) === "declined" ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-app-muted">❌ Refusé</p>
                </div>
              ) : null}
              {user?.id && isCounterProposedModalStatus(proposalDetail.status) ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-app-muted">🔁 Contre-proposition envoyée</p>
                </div>
              ) : null}
              {user?.id &&
              (proposalDetailActions?.accept || proposalDetailActions?.decline || proposalDetailActions?.counter) ? (
                <div className="space-y-2">
                  {proposalDetailActions.accept ? (
                    <button
                      type="button"
                      disabled={proposalActionBusy || pairBlocked}
                      onClick={() => {
                        console.log("[Chat] accept clicked", proposalDetail.id);
                        void respondToProposal(proposalDetail.id, "accepted");
                      }}
                      className="w-full rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition hover:opacity-95 disabled:opacity-50"
                      style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
                    >
                      Oui
                    </button>
                  ) : null}
                  {proposalDetailActions.decline ? (
                    <button
                      type="button"
                      disabled={proposalActionBusy || pairBlocked}
                      onClick={() => {
                        console.log("[Chat] decline clicked", proposalDetail.id);
                        void respondToProposal(proposalDetail.id, "declined");
                      }}
                      className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                    >
                      Non
                    </button>
                  ) : null}
                  {proposalDetailActions.counter ? (
                    <button
                      type="button"
                      disabled={proposalActionBusy || pairBlocked}
                      onClick={() => {
                        console.log("[Chat] counter proposal clicked", proposalDetail.id);
                        setCounterReplaceProposalId(proposalDetail.id);
                        setCounterPrefill({
                          sport: proposalDetail.sport?.trim() || "",
                          place: proposalDetail.location?.trim() || "",
                        });
                        setProposalDetail(null);
                        setModalOpen(true);
                      }}
                      className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                    >
                      🔁 Proposer autre
                    </button>
                  ) : null}
                </div>
              ) : null}
              {user?.id &&
              proposalDetailActions &&
              !proposalDetailActions.accept &&
              !proposalDetailActions.decline &&
              !proposalDetailActions.counter &&
              normalizeProposalStatus(proposalDetail) !== "accepted" &&
              normalizeProposalStatus(proposalDetail) !== "declined" &&
              !isCounterProposedModalStatus(proposalDetail.status) ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-app-muted">{proposalFrozenStateLineFr(proposalDetail)}</p>
                </div>
              ) : null}
            </div>
            <div className="border-t border-app-border/80 px-4 py-3">
              <button
                type="button"
                onClick={() => setProposalDetail(null)}
                className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProposalComposerModal
        open={modalOpen}
        onClose={() => {
          setCounterReplaceProposalId(null);
          setCounterPrefill(null);
          setModalOpen(false);
        }}
        sharedSports={sharedSports}
        titleOverride={counterReplaceProposalId ? "Contre-proposition" : undefined}
        descriptionOverride={
          counterReplaceProposalId
            ? "Proposez une autre activité. La nouvelle proposition remplace la précédente dans la conversation."
            : undefined
        }
        submitLabel={counterReplaceProposalId ? "Envoyer la nouvelle proposition" : undefined}
        onBack={
          counterReplaceProposalId
            ? () => {
                const id = counterReplaceProposalId;
                setModalOpen(false);
                setCounterReplaceProposalId(null);
                setCounterPrefill(null);
                const p = proposals.find((x) => x.id === id);
                if (p) setProposalDetail(p);
              }
            : undefined
        }
        initialSport={counterPrefill?.sport}
        initialPlace={counterPrefill?.place}
        suggestedSlots={suggestedSlots}
        onSubmit={async (p) => {
          await sendActivity(p, counterReplaceProposalId);
          setCounterReplaceProposalId(null);
          setCounterPrefill(null);
          setModalOpen(false);
        }}
      />

      {reportOpen && partnerUserId && user?.id ? (
        <ReportModal
          reportedProfileId={partnerUserId}
          reporterId={user.id}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}
