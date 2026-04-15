import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { INBOX_REFRESH_EVENT } from "../constants";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { insertBlock, isBlockedWith } from "../services/blocks.service";
import { isPhotoVerified } from "../lib/profileVerification";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconSend } from "../components/ui/Icon";
import { ActivityProposalBubble } from "../components/chat/ActivityProposalBubble";
import { ActivityResponseBubble } from "../components/chat/ActivityResponseBubble";
import { ActivityProposalModal } from "../components/ActivityProposalModal";
import { ChatEmojiPicker } from "../components/ChatEmojiPicker";
import { ChatPostMatchPanel } from "../components/ChatPostMatchPanel";
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
  acceptActivityProposal,
  cancelActivityProposal as cancelActivityProposalMutation,
  createCounterProposal,
  createPendingActivityProposal,
  declineActivityProposal,
} from "../lib/messages/activityProposalMutations";
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
const CHAT_ACCENT_OPTIONS: readonly MessageBubbleTheme[] = ["red", "violet", "green", "white"];
const CHAT_DEFAULT_ACCENT: MessageBubbleTheme = "violet";
const CHAT_INPUT_FOCUS_CLASS_BY_ACCENT: Record<MessageBubbleTheme, string> = {
  red: "focus:border-[#FF1E2D]/60 focus:ring-[#FF1E2D]/35",
  violet: "focus:border-violet-400/70 focus:ring-violet-400/35",
  green: "focus:border-emerald-400/70 focus:ring-emerald-400/35",
  yellow: "focus:border-amber-300/70 focus:ring-amber-300/35",
  white: "focus:border-zinc-200/70 focus:ring-zinc-200/30",
};
const CHAT_SEND_BUTTON_STYLE_BY_ACCENT: Record<MessageBubbleTheme, { bg: string; text: string }> = {
  red: { bg: "#FF1E2D", text: "#FFFFFF" },
  violet: { bg: "#7C3AED", text: "#FFFFFF" },
  green: { bg: "#059669", text: "#FFFFFF" },
  yellow: { bg: "#F59E0B", text: "#111827" },
  white: { bg: "#F8FAFC", text: "#111827" },
};
const CHAT_ACCENT_DOT_CLASS_BY_THEME: Record<MessageBubbleTheme, string> = {
  red: "bg-[#FF1E2D]",
  violet: "bg-violet-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  white: "bg-white ring-1 ring-app-border",
};
const CHAT_ACCENT_LABEL_BY_THEME: Record<MessageBubbleTheme, string> = {
  red: "Rouge",
  violet: "Violet",
  green: "Vert",
  yellow: "Jaune",
  white: "Blanc",
};

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

type ProposalStatus = "pending" | "accepted" | "declined" | "cancelled";

type ProposalRow = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  sport: string;
  time_slot: string;
  location: string | null;
  note: string | null;
  created_at: string | null;
  status?: ProposalStatus | string | null;
  scheduled_at?: string | null;
  match_id?: string | null;
  boost_awarded?: boolean | null;
  supersedes_proposal_id?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
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

function parseCreatedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function formatProposalWhenLine(p: ProposalRow): string {
  if (p.scheduled_at) {
    try {
      const d = new Date(p.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
      }
    } catch {
      /* ignore */
    }
  }
  return p.time_slot?.trim() || "Créneau à confirmer";
}

function normalizeProposalStatus(p: ProposalRow): string {
  return normalizeActivityProposalStatus(p.status);
}

function isCounterProposedModalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "counter_proposed" || s === "countered" || s === "replaced";
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
  if (s === "alternative_requested") return "Autre créneau demandé";
  if (s === "replaced" || s === "countered") return "Créneau remplacé";
  if (s === "pending" || s === "proposed") return "En attente de réponse";
  return "Créneau";
}

/** Libellé figé sous la carte / le détail lorsque la proposition n’est plus modifiable. */
function proposalFrozenStateLineFr(p: ProposalRow): string {
  const s = normalizeProposalStatus(p);
  if (s === "accepted") return "✅ Accepté";
  if (s === "declined") return "Pas dispo pour ce créneau";
  if (s === "expired") return "Créneau expiré";
  if (s === "cancelled") return "Créneau annulé";
  if (s === "countered" || s === "replaced") return "Créneau remplacé";
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
  const [windowExpiresAt, setWindowExpiresAt] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [proposalDetail, setProposalDetail] = useState<ProposalRow | null>(null);
  /** Id message proposition concerné, ou `__create__` pendant création / contre-proposition. */
  const [proposalActionInFlightId, setProposalActionInFlightId] = useState<string | null>(null);
  /** Fin de fenêtre pour afficher « … est en train d’écrire » (partenaire uniquement). */
  const [partnerTypingUntil, setPartnerTypingUntil] = useState(0);
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

  const chatSendButtonStyle = CHAT_SEND_BUTTON_STYLE_BY_ACCENT[chatAccentTheme];
  const chatInputFocusClass = CHAT_INPUT_FOCUS_CLASS_BY_ACCENT[chatAccentTheme];

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (conversationId) touchMatchOpenedAt(conversationId);
  }, [conversationId]);

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
    const { data, error } = await supabase
      .from("activity_proposals")
      .select(
        "id, conversation_id, proposer_id, sport, time_slot, location, note, created_at, status, scheduled_at, match_id, boost_awarded, supersedes_proposal_id, responded_by, responded_at",
      )
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[Chat] reloadProposals: select error", {
        conversationId: cid,
        message: error.message,
        code: error.code,
      });
      return;
    }
    const rows = (data as ProposalRow[]) ?? [];
    console.log("[Chat] reloadProposals: response", {
      conversationId: cid,
      rowCount: rows.length,
      proposalIds: rows.map((r) => r.id),
    });
    setProposals(rows);
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
            "id, first_name, main_photo_url, portrait_url, avatar_url, is_photo_verified, gender, intent",
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
    if (!conversationId || !user?.id) return;
    const { error } = await supabase.from("conversation_typing").upsert(
      {
        conversation_id: conversationId,
        user_id: user.id,
        updated_at: TYPING_SENTINEL_ISO,
      },
      { onConflict: "conversation_id,user_id" },
    );
    if (error) console.warn("[Chat] conversation_typing stop", error);
  }, [conversationId, user?.id]);

  const scheduleTypingPulse = useCallback(() => {
    if (!conversationId || !user?.id || pairBlocked) return;
    if (typingPulseTimerRef.current != null) window.clearTimeout(typingPulseTimerRef.current);
    typingPulseTimerRef.current = window.setTimeout(() => {
      typingPulseTimerRef.current = null;
      void supabase.from("conversation_typing").upsert(
        {
          conversation_id: conversationId,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );
    }, TYPING_PULSE_DEBOUNCE_MS);

    if (typingStopTimerRef.current != null) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      typingStopTimerRef.current = null;
      void sendTypingStop();
    }, TYPING_IDLE_STOP_MS);
  }, [conversationId, user?.id, pairBlocked, sendTypingStop]);

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
      if (conversationId && user?.id) {
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
  }, [conversationId, user?.id]);

  useEffect(() => {
    if (!conversationId || authLoading || !user?.id) return;
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
  }, [conversationId, authLoading, user?.id]);

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
  const latestAcceptedProposal = useMemo(
    () => sortedProposalsDesc.find((p) => normalizeProposalStatus(p) === "accepted") ?? null,
    [sortedProposalsDesc],
  );
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
        st === "replaced" ||
        st === "countered" ||
        st === "cancelled"
      )
        continue;
      const sched = p.scheduled_at
        ? new Date(p.scheduled_at).getTime()
        : p.created_at
          ? new Date(p.created_at).getTime() + CHAT_WINDOW_HOURS_MS
          : 0;
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
    if (!user?.id || !conversationId) throw new Error("Non connecté");
    if (pairBlocked) throw new Error("Échange impossible avec ce profil.");
    if (proposalActionInFlightId !== null) throw new Error("Une action est déjà en cours.");

    const note = payload.message.trim();
    const pl = payload.place.trim();
    if (messageContainsDisallowedContent(note) || (pl.length > 0 && messageContainsDisallowedContent(pl))) {
      throw new Error(SAFETY_CONTENT_REFUSAL);
    }

    const { timeLabel } = computeProposalSchedule(payload.when);
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
        const res = await createCounterProposal(supabase, {
          replaceProposalId,
          conversationId,
          currentUserId: user.id,
          sport: payload.sport,
          timeSlot: timeLabel,
          location: loc,
          note: payload.message.trim() || null,
        });
        if ("error" in res) throw new Error(res.error.message || genericProposalError());
      } else {
        const res = await createPendingActivityProposal(supabase, {
          conversationId,
          currentUserId: user.id,
          sport: payload.sport,
          timeSlot: timeLabel,
          location: loc,
          note: payload.message.trim() || null,
        });
        if ("error" in res) throw new Error(res.error.message || genericProposalError());
      }

      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
    } finally {
      setProposalActionInFlightId(null);
    }
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

  async function respondToProposal(proposalId: string, status: "accepted" | "declined") {
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
    const action = status === "accepted" ? "accept" : "decline";
    const gate = assertProposalActionAllowed(action, ctx);
    if (!gate.ok) {
      if (import.meta.env.DEV) console.debug("[Chat] respondToProposal blocked", gate.reason);
      setMessagePolicyError(gate.reason);
      return;
    }

    setProposalActionInFlightId(proposalId);
    try {
      const res =
        status === "accepted"
          ? await acceptActivityProposal(supabase, {
              proposalId,
              conversationId,
              currentUserId: user.id,
            })
          : await declineActivityProposal(supabase, {
              proposalId,
              conversationId,
              currentUserId: user.id,
            });
      if ("error" in res) {
        setMessagePolicyError(res.error.message);
        await reloadProposals(conversationId);
        return;
      }
      setProposalDetail(null);
      setMessagePolicyError(null);
      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
    } finally {
      setProposalActionInFlightId(null);
    }
  }

  async function cancelProposal(proposalId: string) {
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
    const gate = assertProposalActionAllowed("cancel", ctx);
    if (!gate.ok) {
      if (import.meta.env.DEV) console.debug("[Chat] cancelProposal blocked", gate.reason);
      setMessagePolicyError(gate.reason);
      return;
    }

    setProposalActionInFlightId(proposalId);
    try {
      const res = await cancelActivityProposalMutation(supabase, { proposalId });
      if ("error" in res) {
        setMessagePolicyError(res.error.message);
        await reloadProposals(conversationId);
        return;
      }
      setProposalDetail(null);
      setMessagePolicyError(null);
      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
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
                          <span className={`h-2.5 w-2.5 rounded-full ${CHAT_ACCENT_DOT_CLASS_BY_THEME[opt]}`} />
                          {CHAT_ACCENT_LABEL_BY_THEME[opt]}
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
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Session</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold text-app-text">
                {partnerName ? `Avec ${partnerName}` : "Sortie à organiser"}
              </h1>
              {partnerPhotoVerified ? <VerifiedBadge variant="compact" /> : null}
            </div>
          </div>
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
                <p className="text-[13px] font-semibold leading-snug text-app-text">Nouveau match</p>
                <p className="mt-1 text-[12px] leading-relaxed text-app-muted">
                  Envoyez un message ou proposez une activité pour lancer la sortie.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (hasPendingProposal && pendingProposal) {
                      console.log("[Chat] active proposal clicked", pendingProposal.id);
                      scrollToProposalCard(pendingProposal.id);
                    } else {
                      setModalOpen(true);
                    }
                  }}
                  className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition hover:opacity-95"
                  style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
                >
                  {hasPendingProposal ? "Créneau en cours" : "Proposer une activité"}
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

        {latestAcceptedProposal ? (
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-app-border/80 bg-app-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
            <p className="text-[13px] font-semibold leading-snug text-app-text">
              📅 Rencontre planifiée — {formatProposalWhenLine(latestAcceptedProposal)}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-[12px] text-app-muted">📍 {latestAcceptedProposal.location?.trim() || "—"}</p>
              <button
                type="button"
                onClick={() => setProposalDetail(latestAcceptedProposal)}
                className="shrink-0 rounded-lg border border-app-border bg-app-bg px-2.5 py-1 text-[12px] font-semibold text-app-text transition hover:bg-app-border"
              >
                Voir
              </button>
            </div>
          </div>
        ) : null}

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
                    onCancel={() => void cancelProposal(p.id)}
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
              Proposer un créneau
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
                Détail du créneau
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
                  <p className="font-semibold text-app-muted">🔁 Nouveau créneau proposé</p>
                </div>
              ) : null}
              {user?.id && proposalDetailActions?.cancel ? (
                <div className="space-y-2">
                  <p className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug text-app-muted">
                    En attente de réponse de votre partenaire.
                  </p>
                  <button
                    type="button"
                    disabled={proposalActionBusy || pairBlocked}
                    onClick={() => {
                      console.log("[Chat] cancel proposal clicked", proposalDetail.id);
                      void cancelProposal(proposalDetail.id);
                    }}
                    className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                  >
                    Annuler
                  </button>
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
                      Autre
                    </button>
                  ) : null}
                </div>
              ) : null}
              {user?.id &&
              proposalDetailActions &&
              !proposalDetailActions.cancel &&
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

      <ActivityProposalModal
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
            ? "Proposez un autre créneau. La nouvelle proposition remplace la précédente dans la conversation."
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
