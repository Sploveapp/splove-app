import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { dispatchActivityProposalsRefresh, INBOX_REFRESH_EVENT } from "../constants";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { insertBlock, isBlockedWith } from "../services/blocks.service";
import { isIdentityVerified } from "../lib/profileVerification";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconSend } from "../components/ui/Icon";
import { ProposalCard } from "../components/ProposalCard";
import { ActivityResponseBubble } from "../components/chat/ActivityResponseBubble";
import { ChatMessageMeta } from "../components/chat/ChatMessageMeta";
import { ActivityProposalBubble } from "../components/chat/ActivityProposalBubble";
import { ChatConfirmedActivityCard } from "../components/chat/ChatConfirmedActivityCard";
import { MeetingConfirmationPanel } from "../components/MeetingConfirmationPanel";
import { ProposalComposerModal } from "../components/ProposalComposerModal";
import { ChatEmojiPicker } from "../components/ChatEmojiPicker";
import { ChatPostMatchPanel } from "../components/ChatPostMatchPanel";
import type { ActivityPayload } from "../lib/chatActivity";
import { toSupabaseScheduledAtIso } from "../lib/activitySchedule";
import {
  computeProposalSchedule,
  getMatchOpenedAt,
  getProductState,
  touchMatchOpenedAt,
} from "../lib/chatActivity";
import {
  deriveChatActivityFlowPhase,
  type ChatActivityFlowPhase,
} from "../lib/chatActivityFlowPhase";
import {
  formatCompactConfirmedActivityDetail,
  isPendingProposalStatus,
  normalizeActivityProposalStatus,
} from "../lib/messages/activityProposal";
import { logActivityFlowState } from "../lib/activityFlowDevLog";
import { buildActivityProposalRowForRender } from "../lib/messages/activityMessageParser";
import {
  acceptConversationProposal,
  cancelConversationProposal,
  createConversationProposal,
  declineConversationProposal,
  getLatestProposalForConversation,
  listConversationProposals,
} from "../services/activityProposals.service";
import { createCounterProposal } from "../lib/messages/activityProposalMutations";
import {
  assertProposalActionAllowed,
  buildProposalRulesContext,
  getAvailableProposalActions,
} from "../lib/messages/activityProposalRules";
import { ensureConversationWindow } from "../lib/ensureConversationWindow";
import { SAFETY_CONTENT_REFUSAL } from "../constants/copy";
import { fetchPlayTypeBetweenUsers } from "../services/likes.service";
import {
  formatReceivedPlayPresentation,
  isPremiumSplovePlay,
  resolveSplovePlayType,
  SPLOVE_PLAY_META,
  type SplovePlayIntentPresentation,
} from "../lib/splovePlay";
import { ReceivedPlayIntentCard } from "../components/ReceivedPlayIntentCard";

function userFacingError(
  t: (key: string, vars?: Record<string, string | number>) => string,
  message: string,
): string {
  if (message === SAFETY_CONTENT_REFUSAL) return t("safety_content_refusal");

  const low = message.toLowerCase();

  if (
    low.includes("23505") ||
    low.includes("uniq_pending_per_conversation") ||
    low.includes("duplicate key") ||
    low.includes("cannot coerce") ||
    low.includes("pgrst116")
  ) {
    return t("chat_double_slot_waiting");
  }

  if (message === "chat_error_proposal_not_found") {
    return "";
  }

  if (
    message.startsWith("chat_") ||
    message.startsWith("proposal_") ||
    message.startsWith("safety_")
  ) {
    return t(message);
  }

  return message;
}
import {
  canUserSendActivityProposal,
  explainCanSendFreeMessage,
  hasConversationStarted,
  isFreeTextChatMessage,
} from "../lib/chatFirstMessagePolicy";
import { ReportModal } from "../components/ReportModal";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { messageContainsDisallowedContent } from "../lib/chatMessagePolicy";
import { moderateChatComposerText } from "../lib/chatComposerModeration";
import {
  CHAT_BACK_TO_MOVE_PATH,
  CHAT_HEADER_SAFE_AREA_PADDING_TOP,
  formatChatPresenceLabel,
  resolveChatComposerPaddingBottom,
} from "../lib/chatPresenceStatus";
import { useVisualViewportKeyboardInset } from "../hooks/useVisualViewportKeyboardInset";
import {
  isChatKeyboardOpenInset,
  setChatConversationKeyboardOpen,
} from "../lib/chatConversationKeyboardShell";
import { CHAT_BUBBLE_COLOR_ORDER, getChatBubbleColorDef } from "../constants/chatBubbleColors";
import sploveMark from "../assets/welcome/splove-mark.png";
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
import { useTranslation } from "../i18n/useTranslation";
import {
  parseMeetupConfirmationFromRow,
  tryParseMeetupFromMessageBody,
} from "../lib/meetupConfirmation";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
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

const CHAT_QUICK_SUGGESTION_KEYS = ["chat_quick_1", "chat_quick_2", "chat_quick_3"] as const;

type ChatSessionPhase = "new_match" | "active_chat" | "inactive";

type ChatLocationState = {
  partnerFirstName?: string | null;
  partnerMainPhotoUrl?: string | null;
  sharedSports?: string[];
  matchedByUserId?: string | null;
  partnerSportPracticeType?: string | null;
  openActivityComposer?: boolean;
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
  meetup_confirmation?: unknown | null;
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
  read_at?: string | null;
  message_type?: string | null;
  activity_proposal_id?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Si le schéma expose une colonne `payload` plus tard. */
  payload?: unknown;
};

type ChatTimelineItem =
  | { kind: "message"; sortKey: string; createdMs: number; message: TextMessageRow }
  | { kind: "proposal"; sortKey: string; createdMs: number; proposal: ProposalRow };

type ProposalMutationAction = "accept" | "decline" | "cancel" | "counter";

type ProposalMutationState = {
  proposalId: string;
  action: ProposalMutationAction;
  snapshot: ProposalRow;
} | null;

type ProposalOutcomeNotice = {
  status: "accepted" | "declined" | "cancelled";
} | null;

function findProposalRowForAction(
  proposalId: string,
  proposals: ProposalRow[],
  detail: ProposalRow | null,
  mutation: ProposalMutationState,
): ProposalRow | null {
  const fromList = proposals.find((x) => x.id === proposalId);
  if (fromList) return fromList;
  if (detail?.id === proposalId) return detail;
  if (mutation?.proposalId === proposalId) return mutation.snapshot;
  return null;
}

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

/** Messages utilisateur réels (hors réponses système / cartes structurées). */
function isRealUserExchangeMessage(msg: { message_type?: string | null }): boolean {
  const mt = (msg.message_type ?? "text").trim().toLowerCase();
  if (mt === "activity_proposal_response" || mt === "system" || mt === "system_message") {
    return false;
  }
  if (isFreeTextChatMessage(msg)) return true;
  return mt === "activity_proposal";
}

function countRealUserExchangeMessages(messages: TextMessageRow[]): number {
  return messages.filter((m) => isRealUserExchangeMessage(m)).length;
}

function isConversationOpenBannerDismissed(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function persistConversationOpenBannerDismissed(storageKey: string): void {
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    /* quota / private mode */
  }
}

/** Au plus une proposition `pending` / `proposed` (la plus récente) ; historique inchangé. */
function dedupeActivePendingProposalsForChat<T extends { id: string; status?: string | null; created_at?: string }>(
  rows: T[],
): T[] {
  const sorted = [...rows].sort((a, b) => parseCreatedMs(b.created_at) - parseCreatedMs(a.created_at));
  let activeKept = false;
  const out: T[] = [];
  for (const row of sorted) {
    const st = (row.status ?? "").trim().toLowerCase();
    if (st === "pending" || st === "proposed") {
      if (activeKept) continue;
      activeKept = true;
    }
    out.push(row);
  }
  return out;
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

function normalizeProposalStatus(p: ProposalRow): string {
  return normalizeActivityProposalStatus(p.status);
}

function isCounterProposedModalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "counter_proposed" || s === "countered" || s === "replaced" || s === "reschedule_requested";
}

function proposalStatusCardLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  p: ProposalRow,
): string {
  const s = normalizeProposalStatus(p);
  if (s === "accepted") return t("proposal_status_card_accepted");
  if (s === "declined") return t("proposal_status_card_declined");
  if (s === "expired") return t("proposal_status_card_expired");
  if (s === "cancelled") return t("proposal_status_card_cancelled");
  if (s === "reschedule_requested") return t("proposal_status_card_reschedule");
  if (s === "alternative_requested") return t("proposal_status_card_alternative");
  if (s === "replaced" || s === "countered") return t("proposal_status_card_counter");
  if (s === "pending" || s === "proposed") return t("proposal_status_card_pending");
  return t("proposal_status_card_generic");
}

function proposalFrozenLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  p: ProposalRow,
): string {
  const s = normalizeProposalStatus(p);
  if (s === "accepted") return t("proposal_frozen_accepted");
  if (s === "declined") return t("proposal_frozen_declined");
  if (s === "expired") return t("proposal_frozen_expired");
  if (s === "cancelled") return t("proposal_frozen_cancelled");
  if (s === "reschedule_requested") return t("proposal_frozen_reschedule");
  if (s === "countered" || s === "replaced") return t("proposal_frozen_counter");
  return proposalStatusCardLine(t, p);
}

export default function Chat() {
  const { t, language } = useTranslation();
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const navState = (location.state ?? null) as ChatLocationState | null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(navState?.partnerFirstName?.trim() || null);
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(navState?.partnerMainPhotoUrl?.trim() || null);
  const partnerPhotoDisplay = useProfilePhotoSignedUrl(partnerPhoto);
  const keyboardInsetPx = useVisualViewportKeyboardInset();

  useEffect(() => {
    setChatConversationKeyboardOpen(isChatKeyboardOpenInset(keyboardInsetPx));
    return () => setChatConversationKeyboardOpen(false);
  }, [keyboardInsetPx]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [latestProposalTop, setLatestProposalTop] = useState<ProposalRow | null>(null);
  const [windowExpiresAt, setWindowExpiresAt] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [proposalDetail, setProposalDetail] = useState<ProposalRow | null>(null);
  /** Id message proposition concerné, ou `__create__` pendant création / contre-proposition. */
  const [proposalActionInFlightId, setProposalActionInFlightId] = useState<string | null>(null);
  const [proposalMutation, setProposalMutation] = useState<ProposalMutationState>(null);
  const [proposalOutcomeNotice, setProposalOutcomeNotice] = useState<ProposalOutcomeNotice>(null);
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
  const [moderationErrorKind, setModerationErrorKind] = useState<"contact" | "commerce" | null>(null);
  const [policyToast, setPolicyToast] = useState<string | null>(null);
  const [counterProposalSuccessBanner, setCounterProposalSuccessBanner] = useState<string | null>(
    null,
  );
  const [pairBlocked, setPairBlocked] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const blockPartnerInFlightRef = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [partnerIdentityVerifiedBadge, setPartnerIdentityVerifiedBadge] = useState(false);
  const [partnerLastActiveAt, setPartnerLastActiveAt] = useState<string | null>(null);
  const [chatMatchId, setChatMatchId] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);
  const [chatAccentTheme, setChatAccentTheme] = useState<MessageBubbleTheme>(CHAT_DEFAULT_ACCENT);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [chatStyleOpen, setChatStyleOpen] = useState(false);
  const chatMessageInputRef = useRef<HTMLTextAreaElement>(null);
  const openedActivityFromNavRef = useRef(false);
  useEffect(() => {
    openedActivityFromNavRef.current = false;
  }, [conversationId]);
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
  const [matchInitiatorUserId, setMatchInitiatorUserId] = useState<string | null>(null);
  const [autoRelanceEnabled, setAutoRelanceEnabled] = useState(false);
  const [autoRelanceRunning, setAutoRelanceRunning] = useState(false);
  const [suggestionModalExtras, setSuggestionModalExtras] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);
  const [conversationPlay, setConversationPlay] = useState<SplovePlayIntentPresentation | null>(
    null,
  );
  const { hasPlus } = usePremium(user?.id ?? null);

  useEffect(() => {
    if (!user?.id || !partnerUserId) {
      setConversationPlay(null);
      return;
    }
    let cancelled = false;
    void fetchPlayTypeBetweenUsers(user.id, partnerUserId).then((row) => {
      if (cancelled || !row) {
        if (!cancelled) setConversationPlay(null);
        return;
      }
      const play = resolveSplovePlayType(row.playType);
      if (!isPremiumSplovePlay(play)) {
        setConversationPlay(null);
        return;
      }
      const meta = SPLOVE_PLAY_META[play];
      if (row.inbound) {
        const name = partnerName?.trim() || t("unnamed_profile");
        setConversationPlay(formatReceivedPlayPresentation(t, play, name));
        return;
      }
      setConversationPlay({
        play,
        emoji: meta.emoji,
        heading: `${meta.emoji} ${t(meta.titleKey)}`,
        title: t(meta.titleKey),
        body: t(meta.lineKey),
        accentRgb: meta.accentRgb,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, partnerUserId, partnerName, t]);

  useEffect(() => {
    if (!modalOpen) setSuggestionModalExtras(null);
  }, [modalOpen]);

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
      const msg = t("chat_err_auth_timeout");
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
  }, [authLoading, t]);

  const reloadProposals = useCallback(async (cid: string) => {
    console.log("[Chat] reloadProposals: start", { conversationId: cid });
    const rows = await listConversationProposals(cid);
    const latest = await getLatestProposalForConversation(cid);
    const deduped = dedupeActivePendingProposalsForChat(rows as ProposalRow[]);
    console.log("[Chat] reloadProposals: response", {
      conversationId: cid,
      rowCount: rows.length,
      dedupedCount: deduped.length,
      proposalIds: deduped.map((r) => r.id),
    });
    setProposals(deduped);
    setLatestProposalTop(latest as ProposalRow | null);
    if (user?.id && deduped.length > 0) {
      const ids = deduped.map((r) => r.id);
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
        setMyActivityOutcomes({});
      } else {
        const next: Record<string, ActivityFeedbackSentiment> = {};
        for (const row of od ?? []) {
          const r = row as { activity_proposal_id: string; sentiment: ActivityFeedbackSentiment };
          next[r.activity_proposal_id] = r.sentiment;
        }
        setMyActivityOutcomes(next);
      }
    } else {
      setMyActivityOutcomes({});
    }
    dispatchActivityProposalsRefresh();
  }, [user?.id]);

  const reloadChatMessages = useCallback(
    async (cid: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from(CHAT_MESSAGES_TABLE)
        .select("id, body, sender_id, created_at, read_at, message_type, activity_proposal_id, metadata, payload")
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
        return error.message?.trim() || t("chat_err_messages_load");
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
    [user?.id, t],
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
      const msg = t("chat_err_session_timeout");
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
          const msg = t("chat_err_no_conversation");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!user?.id) {
          const msg = t("chat_err_login");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        setLoadError(null);
        setLoading(true);
        setChatMessages([]);
        setPairBlocked(false);
        setPartnerUserId(null);
        setPartnerIdentityVerifiedBadge(false);
        setPairChatMeta(null);
        setMatchInitiatorUserId(null);
        setConversationPlay(null);

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
          const msg = convErr.message?.trim() || t("chat_err_conversation");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!conv?.match_id) {
          const msg = t("chat_err_conversation_not_found");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const mid = conv.match_id as string;
        setChatMatchId(mid);

        const { data: mRow, error: mErr } = await supabase
          .from("matches")
          .select("id, user_a, user_b, initiator_user")
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
          const msg = mErr.message?.trim() || t("chat_err_match");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }
        if (!mRow) {
          const msg = t("chat_err_conversation_not_found");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const ua = (mRow as { user_a: string; user_b: string }).user_a;
        const ub = (mRow as { user_a: string; user_b: string }).user_b;
        const initiator = (mRow as { initiator_user?: string | null }).initiator_user ?? null;
        if (!cancelled) setMatchInitiatorUserId(initiator);
        if (user.id !== ua && user.id !== ub) {
          console.log("[Chat loading] access check result:", {
            ok: false,
            reason: "user not in match pair",
            currentUserId: user.id,
          });
          const msg = t("chat_err_forbidden");
          console.error("[Chat loading] setting error state:", msg);
          setLoadError(msg);
          return;
        }

        const other = user.id === ua ? ub : ua;
        if (!cancelled) {
          setPartnerUserId(other);
        }

        const blocked = await isBlockedWith(other);
        if (!cancelled) setPairBlocked(blocked);

        const { data: pairProfiles } = await supabase
          .from("profiles")
          .select(
            "id, first_name, main_photo_url, portrait_url, avatar_url, is_photo_verified, photo_status, identity_verified, veriff_status, gender, intent, sport_practice_type, last_active_at",
          )
          .in("id", [user.id, other]);
        if (!cancelled && pairProfiles && pairProfiles.length > 0) {
          const mine = pairProfiles.find((r) => r.id === user.id) as
            | {
                gender?: string | null;
                intent?: unknown;
                sport_practice_type?: string | null;
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
                identity_verified?: boolean | null;
                veriff_status?: string | null;
                gender?: string | null;
                intent?: unknown;
                sport_practice_type?: string | null;
                last_active_at?: string | null;
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
            setPartnerIdentityVerifiedBadge(isIdentityVerified(theirs));
            setPartnerLastActiveAt(
              typeof theirs.last_active_at === "string" ? theirs.last_active_at : null,
            );
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
        const msg = message.trim() ? message : t("chat_err_load");
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
  }, [authLoading, conversationId, user?.id, navState?.matchedByUserId, reloadProposals, reloadChatMessages, t]);

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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: CHAT_MESSAGES_TABLE, filter },
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
  const acceptedProposalForRl = useMemo(
    () => sortedProposalsDesc.find((p) => normalizeProposalStatus(p) === "accepted") ?? null,
    [sortedProposalsDesc],
  );

  const meetupFromProposal = useMemo(
    () =>
      acceptedProposalForRl
        ? parseMeetupConfirmationFromRow(acceptedProposalForRl.meetup_confirmation)
        : null,
    [acceptedProposalForRl],
  );

  const meetupFromMessageFallback = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const parsed = tryParseMeetupFromMessageBody(chatMessages[i]?.body ?? "");
      if (parsed) return parsed;
    }
    return null;
  }, [chatMessages]);

  const effectiveMeetupPayload = meetupFromProposal ?? meetupFromMessageFallback;

  const meetupConfirmed = effectiveMeetupPayload?.status === "confirmed";

  const chatActivityPhase = useMemo(
    (): ChatActivityFlowPhase =>
      deriveChatActivityFlowPhase({
        meetupConfirmed,
        hasAcceptedProposal,
        hasPendingProposal,
      }),
    [meetupConfirmed, hasAcceptedProposal, hasPendingProposal],
  );

  const isPostMatchNoActivity = chatActivityPhase === "post_match_no_activity";
  const isActivityPending = chatActivityPhase === "activity_pending";
  const isActivityAcceptedConfirming = chatActivityPhase === "activity_accepted_confirming";
  const isActivityConfirmed = chatActivityPhase === "activity_confirmed";

  const modifyMeetupOpen = Boolean(effectiveMeetupPayload?.engagement?.modify_flow_open);

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

  const sharedSportLead = sharedSports[0]?.trim() ?? "";

  const conversationStarted = useMemo(() => {
    if (!user?.id || !partnerUserId) return false;
    if (!pairChatMeta) {
      return chatMessages.some((m) => isFreeTextChatMessage(m));
    }
    return hasConversationStarted({
      myUserId: user.id,
      partnerUserId,
      chatMessages,
      matchInitiatorUserId,
      myGender: pairChatMeta.myGender,
      myIntent: pairChatMeta.myIntent,
      partnerGender: pairChatMeta.partnerGender,
      partnerIntent: pairChatMeta.partnerIntent,
    });
  }, [
    user?.id,
    partnerUserId,
    pairChatMeta,
    chatMessages,
    matchInitiatorUserId,
  ]);

  const firstMessagePolicyExplain = useMemo(() => {
    if (!user?.id || !partnerUserId || !pairChatMeta) {
      return {
        canSendFreeMessage: conversationStarted,
        reason: conversationStarted ? ("conversation_started" as const) : ("no_user" as const),
      };
    }
    return explainCanSendFreeMessage({
      conversationStarted,
      myUserId: user.id,
      matchInitiatorUserId,
      myGender: pairChatMeta.myGender,
      myIntent: pairChatMeta.myIntent,
      partnerGender: pairChatMeta.partnerGender,
      partnerIntent: pairChatMeta.partnerIntent,
    });
  }, [
    user?.id,
    partnerUserId,
    pairChatMeta,
    conversationStarted,
    matchInitiatorUserId,
  ]);

  const canSendFreeMessage = firstMessagePolicyExplain.canSendFreeMessage;

  const canSendActivity = useMemo(() => {
    if (!user?.id || !partnerUserId) return false;
    if (!pairChatMeta) return true;
    return canUserSendActivityProposal({
      myUserId: user.id,
      myIntent: pairChatMeta.myIntent,
      partnerIntent: pairChatMeta.partnerIntent,
    });
  }, [user?.id, partnerUserId, pairChatMeta]);

  const firstMessagePolicyHint = useMemo(() => {
    if (canSendFreeMessage) return null;
    if (firstMessagePolicyExplain.reason === "hetero_homme_wait") {
      return t("chat_first_message_she_starts");
    }
    const name = partnerName?.trim();
    if (name) return t("chat_first_message_policy_partner", { name });
    return t("chat_first_message_she_starts");
  }, [canSendFreeMessage, firstMessagePolicyExplain.reason, partnerName, t]);

  const partnerPresenceLabel = useMemo(
    () => formatChatPresenceLabel(partnerLastActiveAt, t, nowTick),
    [partnerLastActiveAt, t, nowTick],
  );

  const hasFreeTextMessages = useMemo(
    () => chatMessages.some((m) => isFreeTextChatMessage(m)),
    [chatMessages],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !user?.id || !partnerUserId) return;
    console.log("[Chat] firstMessagePolicy", {
      currentUserId: user.id,
      otherUserId: partnerUserId,
      currentUserGender: pairChatMeta?.myGender ?? null,
      otherUserGender: pairChatMeta?.partnerGender ?? null,
      hasMessages: hasFreeTextMessages,
      canSendFreeMessage,
      reason: firstMessagePolicyExplain.reason,
    });
  }, [
    user?.id,
    partnerUserId,
    pairChatMeta?.myGender,
    pairChatMeta?.partnerGender,
    hasFreeTextMessages,
    canSendFreeMessage,
    firstMessagePolicyExplain.reason,
  ]);

  useEffect(() => {
    if (!policyToast) return;
    const timer = window.setTimeout(() => setPolicyToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [policyToast]);

  const conversationOpenBannerStorageKey = conversationId
    ? `dismissed_activity_banner_${conversationId}`
    : null;
  const realUserMessageCount = useMemo(
    () => countRealUserExchangeMessages(chatMessages),
    [chatMessages],
  );

  useEffect(() => {
    if (!conversationId || !conversationOpenBannerStorageKey) return;
    const dismissed = isConversationOpenBannerDismissed(conversationOpenBannerStorageKey);
    const enoughExchange = realUserMessageCount >= 2;
    if (enoughExchange && !dismissed) {
      persistConversationOpenBannerDismissed(conversationOpenBannerStorageKey);
    }
  }, [conversationId, conversationOpenBannerStorageKey, realUserMessageCount]);

  useEffect(() => {
    if (!counterProposalSuccessBanner) return;
    const timer = window.setTimeout(() => setCounterProposalSuccessBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [counterProposalSuccessBanner]);

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
    if (proposalMutation) {
      const cur = m.get(proposalMutation.proposalId);
      if (!cur) m.set(proposalMutation.proposalId, proposalMutation.snapshot);
    }
    return m;
  }, [proposals, proposalMutation]);

  const headerProposal = useMemo((): ProposalRow | null => {
    if (latestProposal?.id && isPendingProposalStatus(latestProposal.status)) {
      return proposalsById.get(latestProposal.id) ?? latestProposal;
    }
    if (proposalMutation && isPendingProposalStatus(proposalMutation.snapshot.status)) {
      return proposalsById.get(proposalMutation.proposalId) ?? proposalMutation.snapshot;
    }
    return null;
  }, [latestProposal, proposalMutation, proposalsById]);

  const compactConfirmedDetailLine = useMemo(() => {
    if (!meetupConfirmed || !acceptedProposalForRl) return null;
    const dateLocale = language === "en" ? "en-GB" : "fr-FR";
    return formatCompactConfirmedActivityDetail(
      acceptedProposalForRl,
      dateLocale,
      t("date_to_confirm"),
      effectiveMeetupPayload,
    );
  }, [meetupConfirmed, acceptedProposalForRl, effectiveMeetupPayload, language, t]);

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
    const canonicalActiveId = pendingProposal?.id ?? null;
    /** Header `ProposalCard` + une seule bulle par `proposal.id` dans le fil. */
    const bubbleIdsRendered = new Set<string>();
    if (latestProposal?.id) bubbleIdsRendered.add(latestProposal.id);

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
        if (bubbleIdsRendered.has(proposal.id)) {
          return { kind: "message" as const, sortKey, createdMs, message: msg };
        }
        if (hasAcceptedProposal && !isPendingProposalStatus(proposal.status)) {
          return { kind: "message" as const, sortKey, createdMs, message: msg };
        }
        const isActiveSlot = isPendingProposalStatus(proposal.status);
        const staleExtraActive =
          canonicalActiveId != null && isActiveSlot && proposal.id !== canonicalActiveId;
        if (staleExtraActive) {
          return { kind: "message" as const, sortKey, createdMs, message: msg };
        }
        bubbleIdsRendered.add(proposal.id);
        return { kind: "proposal" as const, sortKey, createdMs, proposal };
      }
      return { kind: "message" as const, sortKey, createdMs, message: msg };
    });
    const orphanProposals: ChatTimelineItem[] = proposals
      .filter((p) => {
        if (hasAcceptedProposal && !isPendingProposalStatus(p.status ?? "")) return false;
        if (bubbleIdsRendered.has(p.id)) return false;
        if (linkedIds.has(p.id)) return false;
        if (latestProposalId && p.id !== latestProposalId) return false;
        if (
          canonicalActiveId &&
          isPendingProposalStatus(p.status ?? "") &&
          p.id !== canonicalActiveId
        ) {
          return false;
        }
        return true;
      })
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
  }, [
    chatMessages,
    proposals,
    proposalsById,
    conversationId,
    sortedProposalsDesc,
    pendingProposal?.id,
    latestProposal,
    hasAcceptedProposal,
  ]);

  /** Dernier message sortant (accusé de lecture sur celui-ci uniquement). */
  const lastOwnOutgoingMessage = useMemo(() => {
    const uid = user?.id;
    if (!uid) return null;
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const m = chatMessages[i];
      if (!m || m.sender_id !== uid) continue;
      const mt = m.message_type ?? "text";
      if (mt === "activity_proposal_response") continue;
      if (hasAcceptedProposal && mt === "activity_proposal") continue;
      return m;
    }
    return null;
  }, [chatMessages, user?.id, hasAcceptedProposal]);

  function blockFirstMessagePolicy(): boolean {
    if (canSendFreeMessage) return false;
    const msg = firstMessagePolicyHint ?? t("chat_first_message_policy_generic");
    setPolicyToast(msg);
    return true;
  }

  function blockActivityProposalPolicy(): boolean {
    if (canSendActivity) return false;
    setMessagePolicyError(firstMessagePolicyHint ?? t("chat_first_message_policy_generic"));
    return true;
  }

  function openActivityComposer() {
    if (pairBlocked) return;
    if (hasAcceptedProposal) return;
    if (hasPendingProposal) return;
    if (blockActivityProposalPolicy()) return;
    setModalOpen(true);
  }

  useEffect(() => {
    if (!navState?.openActivityComposer || loading || pairBlocked || openedActivityFromNavRef.current) {
      return;
    }
    if (!pairChatMeta) return;
    openedActivityFromNavRef.current = true;
    openActivityComposer();
  }, [navState?.openActivityComposer, loading, pairBlocked, pairChatMeta]);

  async function sendActivity(payload: ActivityPayload, replaceProposalId: string | null = null) {
    if (!user?.id || !conversationId || !chatMatchId) throw new Error("chat_error_not_connected");
    if (pairBlocked) throw new Error("chat_error_exchange_blocked");
    if (proposalActionInFlightId !== null) throw new Error("chat_error_action_in_flight");
    if (blockActivityProposalPolicy()) throw new Error("chat_first_message_policy_generic");
    if (!replaceProposalId && hasAcceptedProposal) {
      throw new Error("chat_error_activity_confirmed");
    }
    if (!replaceProposalId && hasPendingProposal) {
      throw new Error("chat_double_slot_waiting");
    }

    const notePrefix = hasPlus ? "[Proposition prioritaire SPLove+] " : "";
    const note = `${notePrefix}${payload.message.trim()}`.trim();
    const pl = payload.place.trim();
    if (messageContainsDisallowedContent(note) || (pl.length > 0 && messageContainsDisallowedContent(pl))) {
      throw new Error("safety_content_refusal");
    }

    const fallbackSchedule = computeProposalSchedule(payload.when);
    const scheduledAtForRpc =
      toSupabaseScheduledAtIso(payload.scheduledAt) ??
      toSupabaseScheduledAtIso(fallbackSchedule.scheduledAt);
    if (replaceProposalId && !scheduledAtForRpc) {
      throw new Error("chat_error_generic");
    }
    const scheduledAtIso = scheduledAtForRpc ?? fallbackSchedule.scheduledAt;
    const dateLocale = language === "en" ? "en-GB" : "fr-FR";
    const timeLabel = (() => {
      if (!scheduledAtIso) return fallbackSchedule.timeLabel;
      const d = new Date(scheduledAtIso);
      if (Number.isNaN(d.getTime())) return fallbackSchedule.timeLabel;
      return d.toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
    })();
    const loc = payload.place.trim() || t("place_to_define");

    let counterPrev: ProposalRow | null = null;
    if (replaceProposalId) {
      counterPrev = findProposalRowForAction(
        replaceProposalId,
        proposals,
        proposalDetail,
        proposalMutation,
      );
      if (!counterPrev?.id) {
        if (import.meta.env.DEV) {
          console.debug("[Chat] sendActivity counter: proposal not found", replaceProposalId);
        }
        return;
      }
      const ctx = buildProposalRulesContext({
        proposal: counterPrev,
        currentUserId: user.id,
        conversationReady: Boolean(conversationId && user.id),
        pairBlocked,
      });
      const gate = assertProposalActionAllowed("counter", ctx);
      if (!gate.ok) {
        if (import.meta.env.DEV) console.debug("[Chat] sendActivity counter blocked", gate.reason);
        if (gate.reason !== "chat_error_proposal_not_found") {
          throw new Error(gate.reason);
        }
        return;
      }
      setProposalMutation({ proposalId: replaceProposalId, action: "counter", snapshot: counterPrev });
    }

    const lockId = replaceProposalId ?? "__create__";
    setProposalActionInFlightId(lockId);
    logActivityFlowState({
      proposalId: replaceProposalId,
      status: counterPrev?.status ?? null,
      proposerId: counterPrev?.proposer_id ?? user.id,
      currentUserId: user.id,
      action: replaceProposalId ? "counter" : "create",
      isSubmitting: true,
      source: "Chat.sendActivity",
    });
    try {
      if (replaceProposalId) {
        if (import.meta.env.DEV) {
          console.log("[Chat] sendActivity counter via RPC", { replaceProposalId });
        }
        const res = await createCounterProposal(supabase, {
          replaceProposalId,
          conversationId,
          currentUserId: user.id,
          sport: payload.sport,
          timeSlot: timeLabel,
          location: loc,
          note: payload.message.trim() || null,
          scheduledAt: scheduledAtForRpc,
        });
        if ("error" in res) {
          console.warn("[Chat] createCounterProposal failed", res.error);
          throw new Error(res.error.code === "rpc" ? "chat_error_generic" : res.error.message);
        }
        setCounterProposalSuccessBanner(t("counter_proposal_success_banner"));
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

      setProposalOutcomeNotice(null);
      setModalOpen(false);
      setCounterReplaceProposalId(null);
      setCounterPrefill(null);
      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
      logActivityFlowState({
        proposalId: replaceProposalId,
        currentUserId: user.id,
        action: replaceProposalId ? "counter" : "create",
        isSubmitting: false,
        source: "Chat.sendActivity:done",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) {
        console.warn("[Chat] sendActivity error", msg, e);
      }
      if (replaceProposalId && msg === "chat_double_slot_waiting") {
        return;
      }
      if (msg && msg !== "chat_error_proposal_not_found") {
        throw e;
      }
    } finally {
      setProposalActionInFlightId(null);
      setProposalMutation(null);
      logActivityFlowState({
        proposalId: replaceProposalId,
        currentUserId: user.id,
        action: replaceProposalId ? "counter" : "create",
        isSubmitting: false,
        source: "Chat.sendActivity:finally",
      });
    }
  }

  async function handleAutoRelance() {
    if (!user?.id || !conversationId || !pendingProposal || autoRelanceRunning) return;
    if (!autoRelanceEnabled || !hasPlus) {
      setMessagePolicyError(t("chat_error_auto_relance_plus"));
      return;
    }
    if (hasAutoRelanceBeenSent(user.id, pendingProposal.id)) return;

    setAutoRelanceRunning(true);
    const { error } = await supabase.from(CHAT_MESSAGES_TABLE).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: t("chat_auto_relance_message"),
    });
    setAutoRelanceRunning(false);

    if (error) {
      setMessagePolicyError(t("chat_error_relance_failed"));
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
      setMessagePolicyError(t("chat_error_exchange_blocked"));
      setModerationErrorKind(null);
      return;
    }
    if (blockFirstMessagePolicy()) return;
    const text = draftMessage.trim();
    if (!text) return;
    const moderation = moderateChatComposerText(text);
    if (moderation.blocked) {
      // Ne jamais effacer le brouillon — l’utilisateur peut corriger.
      setMessagePolicyError(
        moderation.kind === "contact" ? t("safety_contact_refusal") : t("safety_commerce_refusal"),
      );
      setModerationErrorKind(moderation.kind);
      return;
    }
    if (messageContainsDisallowedContent(text)) {
      setMessagePolicyError(t("safety_content_refusal"));
      setModerationErrorKind("contact");
      return;
    }
    setMessagePolicyError(null);
    setModerationErrorKind(null);
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
        setMessagePolicyError(t("safety_content_refusal"));
        setModerationErrorKind("contact");
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
      setMessagePolicyError(t("chat_error_exchange_blocked"));
      return;
    }
    if (blockFirstMessagePolicy()) {
      console.error("[Chat] add blocked reason", "firstMessagePolicy");
      return;
    }
    const text = draftMessage.trim();
    if (!text) {
      console.error("[Chat] add blocked reason", "emptyDraft");
      setMessagePolicyError(t("chat_error_write_first"));
      return;
    }
    console.log("[Chat] add payload", { body: text, conversationId, senderId: user.id });
    void sendChatMessage();
  }

  async function respondToProposal(proposalId: string, status: "accepted" | "declined" | "cancelled") {
    if (!user?.id || !conversationId) return;
    if (proposalActionInFlightId !== null) return;

    const p = findProposalRowForAction(proposalId, proposals, proposalDetail, proposalMutation);
    if (!p?.id) {
      if (import.meta.env.DEV) console.debug("[Chat] respondToProposal skip: no row", proposalId);
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
      logActivityFlowState({
        proposalId,
        status: p.status,
        proposerId: p.proposer_id,
        currentUserId: user.id,
        action,
        isSubmitting: false,
        source: `Chat.respondToProposal:blocked:${gate.reason}`,
      });
      if (import.meta.env.DEV) console.debug("[Chat] respondToProposal blocked", gate.reason);
      if (
        gate.reason !== "chat_error_proposal_not_found" &&
        gate.reason !== "proposal_error_no_longer_editable"
      ) {
        setMessagePolicyError(t(gate.reason));
      } else if (gate.reason === "proposal_error_no_longer_editable") {
        void reloadProposals(conversationId);
        void reloadChatMessages(conversationId);
      }
      return;
    }

    const mutationAction: ProposalMutationAction =
      status === "accepted" ? "accept" : status === "declined" ? "decline" : "cancel";
    const respondedAt = new Date().toISOString();
    const optimistic: ProposalRow = { ...p, status, responded_at: respondedAt };

    setProposalMutation({ proposalId, action: mutationAction, snapshot: p });
    setProposalActionInFlightId(proposalId);
    logActivityFlowState({
      proposalId,
      status: optimistic.status,
      proposerId: p.proposer_id,
      currentUserId: user.id,
      action: mutationAction,
      isSubmitting: true,
      source: "Chat.respondToProposal",
    });
    setProposals((prev) => prev.map((row) => (row.id === proposalId ? optimistic : row)));
    if (proposalDetail?.id === proposalId) setProposalDetail(optimistic);

    try {
      if (status === "accepted") {
        await acceptConversationProposal(proposalId);
      } else if (status === "declined") {
        await declineConversationProposal(proposalId);
      } else {
        await cancelConversationProposal(proposalId);
      }
      setProposalOutcomeNotice({ status });
      setProposalDetail(null);
      setMessagePolicyError(null);
      await reloadProposals(conversationId);
      await reloadChatMessages(conversationId);
      logActivityFlowState({
        proposalId,
        status,
        proposerId: p.proposer_id,
        currentUserId: user.id,
        action: mutationAction,
        isSubmitting: false,
        source: "Chat.respondToProposal:done",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (import.meta.env.DEV) console.warn("[Chat] respondToProposal error", msg);
      if (msg && msg !== "chat_error_proposal_not_found") {
        const friendly = userFacingError(t, msg).trim();
        if (friendly.length > 0) {
          setMessagePolicyError(friendly);
        }
      }
      try {
        await reloadProposals(conversationId);
        await reloadChatMessages(conversationId);
      } catch {
        /* resync best-effort */
      }
    } finally {
      setProposalActionInFlightId(null);
      setProposalMutation(null);
      logActivityFlowState({
        proposalId,
        status,
        currentUserId: user.id,
        action: mutationAction,
        isSubmitting: false,
        source: "Chat.respondToProposal:finally",
      });
    }
  }

  async function handleBlockPartner() {
    if (!user?.id || !partnerUserId || blockPartnerInFlightRef.current) return;
    if (!window.confirm(t("block_profile_confirm"))) return;
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
      setMessagePolicyError(t("chat_error_activity_confirmed"));
      return;
    }
    setSuggestionModalExtras(null);
    openActivityComposer();
  }

  if (!conversationId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{t("chat_err_no_conversation")}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          {t("chat_back_to_discover")}
        </Link>
      </div>
    );
  }

  if (authLoading && !authGateError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg p-6 font-sans">
        <p className="text-sm text-app-muted">{t("chat_loading_session")}</p>
      </div>
    );
  }

  if (authGateError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{authGateError}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          {t("chat_back_to_discover")}
        </Link>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{t("chat_err_login")}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          {t("chat_back_to_discover")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg p-6 font-sans">
        <p className="text-sm text-app-muted">{t("chat_loading_session")}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-app-bg p-6 font-sans">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link className="mt-6 text-sm font-semibold text-[#FF1E2D] underline" to="/discover">
          {t("chat_back_to_discover")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <header
        className="relative shrink-0 border-b border-app-border/80 bg-app-card px-3 pb-3"
        style={{ paddingTop: CHAT_HEADER_SAFE_AREA_PADDING_TOP }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(CHAT_BACK_TO_MOVE_PATH)}
            aria-label="SPLove — Move"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
          >
            <img src={sploveMark} alt="" aria-hidden className="h-7 w-7 object-contain" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1">
            <div className="flex max-w-full items-center gap-2">
              {partnerPhoto ? (
                partnerPhotoDisplay ? (
                  <img
                    src={partnerPhotoDisplay}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-app-border"
                  />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-full bg-app-border ring-2 ring-app-border" />
                )
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-full bg-app-border ring-2 ring-app-border" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-[15px] font-bold text-app-text">
                    {partnerName?.trim() || t("chat_plan_activity")}
                  </h1>
                  {partnerPresenceLabel === t("chat_presence_online") ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 ring-2 ring-app-card"
                      aria-hidden
                    />
                  ) : null}
                  {partnerIdentityVerifiedBadge ? <VerifiedBadge variant="compact" /> : null}
                </div>
                {partnerPresenceLabel ? (
                  <p className="truncate text-center text-[11px] text-app-muted">{partnerPresenceLabel}</p>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setChatOptionsOpen((v) => !v);
              setChatStyleOpen(false);
            }}
            aria-expanded={chatOptionsOpen}
            aria-label={t("chat_options_aria")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition hover:bg-app-border hover:text-app-text"
          >
            <span className="text-lg leading-none">•••</span>
          </button>
        </div>
        {chatOptionsOpen ? (
          <div className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-20 w-[230px] rounded-2xl border border-app-border/90 bg-app-card p-2 shadow-xl ring-1 ring-white/[0.05]">
            <button
              type="button"
              onClick={() => setChatStyleOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium text-app-text transition hover:bg-app-border/50"
            >
              <span>{t("chat_style")}</span>
              <span className="text-app-muted">{chatStyleOpen ? "−" : "+"}</span>
            </button>
            {chatStyleOpen ? (
              <div className="mt-1 space-y-2 rounded-xl bg-app-bg/80 px-2 py-2">
                <p className="px-1 text-[11px] leading-snug text-app-muted">
                  {t("chat_style_hint")}
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
                          {t(optDef.label)}
                        </span>
                        {active ? <span className="text-[11px]">{t("active")}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {partnerUserId && user?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setChatOptionsOpen(false);
                    setReportOpen(true);
                  }}
                  className="mt-1 flex w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-app-muted transition hover:bg-app-border/50 hover:text-app-text"
                >
                  {t("report_profile")}
                </button>
                {!pairBlocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setChatOptionsOpen(false);
                      void handleBlockPartner();
                    }}
                    className="flex w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-app-muted transition hover:bg-app-border/50 hover:text-app-text"
                  >
                    {t("hide_profile")}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pt-4">
        {pairBlocked ? (
          <p className="mb-3 rounded-xl border border-app-border bg-app-border/90 px-3 py-2.5 text-sm leading-snug text-app-text">
            {t("chat_blocked_organize")}
          </p>
        ) : null}
        {!pairBlocked && isActivityPending && pendingWithoutResponse ? (
          <div className="mb-3 rounded-2xl border border-app-border/80 bg-app-card px-4 py-3 shadow-sm">
            <p className="text-[12px] leading-snug text-app-muted">
              {t("chat_pending_nudge")} {hasPlus ? t("chat_pending_nudge_cta_plus") : t("chat_pending_nudge_cta_free")}
            </p>
            {hasPlus ? (
              <button
                type="button"
                disabled={autoRelanceRunning || !autoRelanceEnabled}
                onClick={() => void handleAutoRelance()}
                className="mt-2 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-text disabled:opacity-50"
              >
                {autoRelanceRunning ? t("chat_relance_sending") : t("chat_relance_auto")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/splove-plus")}
                className="mt-2 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[12px] font-semibold text-app-text"
              >
                {t("chat_discover_splove_plus")}
              </button>
            )}
          </div>
        ) : null}
        {!pairBlocked && isActivityConfirmed && compactConfirmedDetailLine ? (
          <ChatConfirmedActivityCard
            detailLine={compactConfirmedDetailLine}
            onViewMeetup={() => navigate("/mes-rencontres?tab=confirmed")}
          />
        ) : null}
        {!pairBlocked &&
        isActivityAcceptedConfirming &&
        acceptedProposalForRl &&
        conversationId &&
        user?.id &&
        (!effectiveMeetupPayload || modifyMeetupOpen) ? (
          <div className="mb-3">
            <MeetingConfirmationPanel
              key={`${acceptedProposalForRl.id}-${modifyMeetupOpen ? "rev" : "new"}`}
              proposalId={acceptedProposalForRl.id}
              conversationId={conversationId}
              currentUserId={user.id}
              otherParticipantId={partnerUserId}
              sport={acceptedProposalForRl.sport}
              timeSlot={acceptedProposalForRl.time_slot}
              initialLocation={acceptedProposalForRl.location}
              meetupDraft={modifyMeetupOpen ? effectiveMeetupPayload ?? null : null}
              language={language}
              onSaved={async () => {
                await reloadProposals(conversationId);
                await reloadChatMessages(conversationId);
              }}
            />
          </div>
        ) : null}
        {!pairBlocked && isPostMatchNoActivity ? (
        <ChatPostMatchPanel
          productState={productState}
          matchOpenedAt={matchOpenedAt}
          windowExpiresAt={windowExpiresAt}
          nowTick={nowTick}
          onProposeClick={() => {
            if (hasPendingProposal) {
              console.error("[Chat] add blocked", "pendingProposalExists");
              setMessagePolicyError(t("chat_error_slot_pending_detail"));
              return;
            }
            handleProposeActivityClick();
          }}
          proposeDisabled={hasPendingProposal || hasAcceptedProposal || pairBlocked}
          showCompactPropose
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
        ) : null}

        {feedbackEligibleProposal && !pairBlocked ? (
          <div className="mb-3 rounded-2xl border border-app-border/70 bg-app-card/90 px-3 py-2.5 shadow-sm ring-1 ring-white/[0.04]">
            <p className="text-[11px] font-medium leading-snug text-app-muted">
              {t("chat_feedback_outing_hint")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { s: "positive" as const, labelKey: "chat_feedback_positive" as const },
                  { s: "neutral" as const, labelKey: "chat_feedback_neutral" as const },
                  { s: "negative" as const, labelKey: "chat_feedback_negative" as const },
                ] as const
              ).map(({ s, labelKey }) => (
                <button
                  key={s}
                  type="button"
                  disabled={outcomeSubmitting}
                  onClick={() => void submitActivityOutcome(feedbackEligibleProposal.id, s)}
                  className="rounded-full border border-app-border/90 bg-app-bg px-3 py-1.5 text-[11px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {proposalOutcomeNotice && !hasAcceptedProposal ? (
          <div className="mb-3 rounded-2xl border border-app-border/90 bg-app-card px-4 py-3 text-center text-[13px] font-semibold leading-snug text-app-text shadow-sm">
            {proposalOutcomeNotice.status === "accepted"
              ? t("chat_proposal_outcome_accepted")
              : proposalOutcomeNotice.status === "declined"
                ? t("chat_proposal_outcome_declined")
                : t("chat_proposal_outcome_cancelled")}
          </div>
        ) : null}

        {counterProposalSuccessBanner ? (
          <div
            className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-center text-[13px] leading-snug text-emerald-100"
            role="status"
          >
            {counterProposalSuccessBanner}
          </div>
        ) : null}

        {isActivityPending && headerProposal?.id && isPendingProposalStatus(headerProposal.status) ? (
          <div className="mb-3">
            <ProposalCard
              proposal={headerProposal}
              currentUserId={user?.id}
              conversationReady={Boolean(conversationId && user?.id)}
              pairBlocked={pairBlocked}
              mine={headerProposal.proposer_id === user?.id}
              proposalActionLocked={proposalActionBusy}
              proposalActionInFlightId={proposalActionInFlightId}
              proposalMutationAction={
                proposalMutation?.proposalId === headerProposal.id &&
                proposalMutation.action !== "counter"
                  ? proposalMutation.action
                  : null
              }
              onOpenDetail={() => setProposalDetail(headerProposal)}
              onAccept={() => void respondToProposal(headerProposal.id, "accepted")}
              onDecline={() => void respondToProposal(headerProposal.id, "declined")}
              onCounter={() => {
                setCounterReplaceProposalId(headerProposal.id);
                setCounterPrefill({
                  sport: headerProposal.sport?.trim() || "",
                  place: headerProposal.location?.trim() || "",
                });
                openActivityComposer();
              }}
              onCancel={() => void respondToProposal(headerProposal.id, "cancelled")}
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
          {conversationPlay ? (
            <ReceivedPlayIntentCard presentation={conversationPlay} className="mb-1" />
          ) : null}
          {!pairBlocked && chatTimeline.length === 0 && chatSessionPhase === "new_match" ? (
            <div className="space-y-2" aria-label={t("chat_quick_suggestions_aria")}>
              <p className="text-[13px] font-semibold text-app-text">{t("chat_start_conversation")}</p>
              {CHAT_QUICK_SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDraftMessage(t(key));
                    setMessagePolicyError(null);
                    setModerationErrorKind(null);
                    requestAnimationFrame(() => chatMessageInputRef.current?.focus());
                  }}
                  className="flex w-full items-center rounded-full border border-app-border/90 bg-transparent px-4 py-2.5 text-left text-[13px] font-medium leading-snug text-app-text transition hover:border-app-accent/35"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          ) : null}
            <div className="space-y-2">
              {chatTimeline.map((item) => {
                if (item.kind === "message") {
                  const m = item.message;
                  const mine = m.sender_id === user?.id;
                  const mt = m.message_type ?? "text";
                  if (hasAcceptedProposal && (mt === "activity_proposal" || mt === "activity_proposal_response")) {
                    return null;
                  }
                  if (mt === "activity_proposal_response") {
                    return (
                      <div key={item.sortKey} className="flex flex-col items-center">
                        <ActivityResponseBubble message={m} />
                        <ChatMessageMeta createdAt={m.created_at} align="center" />
                      </div>
                    );
                  }
                  const showReadStatus = mine && lastOwnOutgoingMessage?.id === m.id;
                  return (
                    <div
                      key={item.sortKey}
                      className={`flex max-w-[85%] flex-col ${mine ? "ml-auto items-end" : "mr-auto items-start"}`}
                    >
                      <div
                        className={
                          mine
                            ? `chat-message-bubble ${getOwnMessageBubbleClassName(chatAccentTheme)}`
                            : "chat-message-bubble rounded-2xl border border-app-border bg-app-card px-3.5 py-2.5 text-sm leading-snug text-app-text shadow-sm"
                        }
                        {...{ "x-apple-data-detectors": "false" }}
                      >
                        {m.body}
                      </div>
                      <ChatMessageMeta
                        createdAt={m.created_at}
                        align={mine ? "right" : "left"}
                        readAt={m.read_at}
                        showReadStatus={showReadStatus}
                      />
                    </div>
                  );
                }
                const p = item.proposal;
                if (!p?.id) return null;
                const mine = p.proposer_id === user?.id;
                const linkedOwnMsg =
                  mine && lastOwnOutgoingMessage?.activity_proposal_id === p.id
                    ? lastOwnOutgoingMessage
                    : (chatMessages.find(
                        (row) => row.activity_proposal_id === p.id && row.sender_id === user?.id,
                      ) ?? null);
                const showProposalReadStatus =
                  mine && linkedOwnMsg != null && lastOwnOutgoingMessage?.id === linkedOwnMsg.id;
                return (
                  <div
                    key={item.sortKey}
                    className={`flex max-w-[92%] flex-col ${mine ? "ml-auto items-end" : "mr-auto items-start"}`}
                  >
                    <ActivityProposalBubble
                      proposal={p}
                      currentUserId={user?.id}
                      conversationReady={Boolean(conversationId && user?.id)}
                      pairBlocked={pairBlocked}
                      mine={mine}
                      proposalActionLocked={proposalActionBusy}
                      proposalActionInFlightId={proposalActionInFlightId}
                      proposalMutationAction={
                        proposalMutation?.proposalId === p.id &&
                        proposalMutation.action !== "counter"
                          ? proposalMutation.action
                          : null
                      }
                      onOpenDetail={() => setProposalDetail(p)}
                      onAccept={() => void respondToProposal(p.id, "accepted")}
                      onDecline={() => void respondToProposal(p.id, "declined")}
                      onCounter={() => {
                        setCounterReplaceProposalId(p.id);
                        setCounterPrefill({
                          sport: p.sport?.trim() || "",
                          place: p.location?.trim() || "",
                        });
                        openActivityComposer();
                      }}
                      onCancel={() => void respondToProposal(p.id, "cancelled")}
                    />
                    <ChatMessageMeta
                      createdAt={p.created_at}
                      align={mine ? "right" : "left"}
                      readAt={linkedOwnMsg?.read_at}
                      showReadStatus={showProposalReadStatus}
                    />
                  </div>
                );
              })}
            </div>
        </div>

        <div
          className="shrink-0 space-y-3 border-t border-app-border/80 bg-app-bg pt-3"
          style={{ paddingBottom: resolveChatComposerPaddingBottom(keyboardInsetPx) }}
        >
          {!pairBlocked && partnerName && partnerTypingUntil > Date.now() ? (
            <p className="text-[12px] italic leading-snug text-app-muted" aria-live="polite">
              {t("chat_typing", { name: partnerName ?? "" })}
            </p>
          ) : null}
          {!pairBlocked ? (
            <>
              <div className="flex items-center gap-2 rounded-full border border-app-border/90 bg-app-card px-2 py-1.5">
                <ChatEmojiPicker
                  disabled={sendingMessage || pairBlocked}
                  onEmojiSelect={(emoji) => appendEmojiToDraft(emoji)}
                />
                <textarea
                  ref={chatMessageInputRef}
                  value={draftMessage}
                  onChange={(e) => {
                    setDraftMessage(e.target.value);
                    setMessagePolicyError(null);
                    setModerationErrorKind(null);
                    scheduleTypingPulse();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddClick();
                    }
                  }}
                  placeholder={t("chat_placeholder")}
                  rows={1}
                  disabled={sendingMessage || pairBlocked}
                  enterKeyHint="send"
                  autoComplete="off"
                  className={`max-h-24 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${canSendFreeMessage ? chatInputFocusClass : ""}`}
                />
                <button
                  type="button"
                  onClick={() => handleAddClick()}
                  disabled={sendingMessage}
                  aria-label={t("chat_add")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: chatSendButtonStyle.bg, color: chatSendButtonStyle.text }}
                >
                  <IconSend size={18} color="currentColor" />
                </button>
              </div>
            </>
          ) : null}
          {messagePolicyError ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[13px] leading-snug text-amber-100"
            >
              <p>{messagePolicyError}</p>
              {moderationErrorKind === "commerce" ? (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold underline decoration-amber-200/50 underline-offset-2"
                  onClick={() => {
                    const ok = window.confirm(t("chat_moderation_false_positive_confirm"));
                    if (!ok) return;
                    setMessagePolicyError(null);
                    setModerationErrorKind(null);
                    if (partnerUserId) setReportOpen(true);
                  }}
                >
                  {t("chat_moderation_false_positive")}
                </button>
              ) : null}
            </div>
          ) : null}
          {!pairBlocked && canSendActivity && isPostMatchNoActivity ? (
            <button
              type="button"
              data-testid="chat-primary-propose-activity"
              onClick={() => handleProposeActivityClick()}
              disabled={pairBlocked || !canSendActivity || hasPendingProposal || hasAcceptedProposal}
              className="w-full rounded-xl py-3.5 text-sm font-bold shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {t("chat_propose_activity_cta")}
            </button>
          ) : null}
          {!pairBlocked && isActivityPending ? (
            <p className="rounded-xl border border-app-border/80 bg-app-card/80 px-3 py-2.5 text-center text-[12px] leading-snug text-app-muted">
              {t("chat_double_slot_waiting")}
            </p>
          ) : null}
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
                {t("proposal_detail_title")}
              </h2>
              {proposalDetail.supersedes_proposal_id ? (
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#FF1E2D]/90">
                  {t("proposal_counter_badge")}
                </p>
              ) : null}
              <p className="mt-0.5 text-[12px] text-app-muted">
                {proposalStatusCardLine(t, proposalDetail)}
              </p>
            </div>
            <div className="space-y-3 px-4 py-4 text-app-text">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{t("activity")}</p>
                <p className="mt-0.5 text-[15px] font-semibold">{proposalDetail.sport}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{t("when")}</p>
                <p className="mt-0.5 text-sm">
                  {proposalDetail.time_slot?.trim() || t("date_to_confirm")}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{t("place")}</p>
                <p className="mt-0.5 text-sm">{proposalDetail.location?.trim() || "—"}</p>
              </div>
              {proposalDetail.note?.trim() ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{t("message")}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">{proposalDetail.note}</p>
                </div>
              ) : null}
              {user?.id && normalizeProposalStatus(proposalDetail) === "accepted" ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-emerald-200/95">{`✅ ${t("accepted")}`}</p>
                </div>
              ) : null}
              {user?.id && normalizeProposalStatus(proposalDetail) === "declined" ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-app-muted">{`❌ ${t("refused")}`}</p>
                </div>
              ) : null}
              {user?.id && isCounterProposedModalStatus(proposalDetail.status) ? (
                <div className="rounded-xl border border-app-border/80 bg-app-bg/80 px-3 py-2.5 text-[13px] leading-snug">
                  <p className="font-semibold text-app-muted">{`🔁 ${t("counter_proposal_sent")}`}</p>
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
                      {t("proposal_yes")}
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
                      {t("proposal_no")}
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
                        openActivityComposer();
                      }}
                      className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border disabled:opacity-50"
                    >
                      🔁 {t("proposal_counter_suggest")}
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
                  <p className="font-semibold text-app-muted">
                    {proposalFrozenLine(t, proposalDetail)}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="border-t border-app-border/80 px-4 py-3">
              <button
                type="button"
                onClick={() => setProposalDetail(null)}
                className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-[13px] font-semibold text-app-text transition hover:bg-app-border"
              >
                {t("close")}
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
        titleOverride={
          counterReplaceProposalId ? t("proposal_counter_modal_title") : suggestionModalExtras?.title
        }
        descriptionOverride={
          counterReplaceProposalId ? t("proposal_counter_modal_desc") : suggestionModalExtras?.subtitle
        }
        submitLabel={counterReplaceProposalId ? t("proposal_counter_submit") : undefined}
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
        initialSport={
          counterPrefill?.sport ??
          (!counterReplaceProposalId && suggestionModalExtras && sharedSportLead ? sharedSportLead : undefined)
        }
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

      {policyToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-24 left-1/2 z-[120] max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-app-border/90 bg-app-card px-4 py-2.5 text-center text-[13px] leading-snug text-app-text shadow-lg"
        >
          {policyToast}
        </div>
      ) : null}
    </div>
  );
}
