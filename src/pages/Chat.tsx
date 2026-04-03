import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CHAT_MESSAGES_TABLE, logSupabaseTableError, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { insertBlock, isBlockedWith } from "../services/blocks.service";
import { isPhotoVerified } from "../lib/profileVerification";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconSend } from "../components/ui/Icon";
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
import {
  MESSAGE_BUBBLE_THEME_CHANGED_EVENT,
  getOwnMessageBubbleClassName,
  loadMessageBubbleThemeFromStorage,
  type MessageBubbleTheme,
} from "../lib/messageBubbleTheme";
import { messageContainsDisallowedContent } from "../lib/chatMessagePolicy";
type ChatLocationState = {
  partnerFirstName?: string | null;
  partnerMainPhotoUrl?: string | null;
  sharedSports?: string[];
  matchedByUserId?: string | null;
};

type ProposalRow = {
  id: string;
  conversation_id: string;
  proposer_id: string;
  sport: string;
  time_slot: string;
  location: string | null;
  note: string | null;
  created_at: string | null;
};

type TextMessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
};

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const navState = (location.state ?? null) as ChatLocationState | null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(navState?.partnerFirstName?.trim() || null);
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(navState?.partnerMainPhotoUrl?.trim() || null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [windowExpiresAt, setWindowExpiresAt] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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
  const [messageBubbleTheme, setMessageBubbleTheme] = useState<MessageBubbleTheme>(() =>
    loadMessageBubbleThemeFromStorage(),
  );
  const chatMessageInputRef = useRef<HTMLTextAreaElement>(null);
  const chatLoadSeqRef = useRef(0);
  const chatLoadWatchdogRef = useRef<number | null>(null);
  const authWatchdogRef = useRef<number | null>(null);
  const [authGateError, setAuthGateError] = useState<string | null>(null);
  const [relanceBusy, setRelanceBusy] = useState(false);
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

  useEffect(() => {
    console.log("[Chat loading] mount");
    const syncTheme = () => setMessageBubbleTheme(loadMessageBubbleThemeFromStorage());
    window.addEventListener(MESSAGE_BUBBLE_THEME_CHANGED_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(MESSAGE_BUBBLE_THEME_CHANGED_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
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
    const { data, error } = await supabase
    .from("activity_proposals")
    .select("id, conversation_id, proposer_id, sport, time_slot, location, note, created_at")
    .eq("conversation_id", cid)
    .order("created_at", { ascending: false });
    if (error) {
      console.warn("[Chat] proposals", error);
      return;
    }
    setProposals((data as ProposalRow[]) ?? []);
  }, []);

  const reloadChatMessages = useCallback(async (cid: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from(CHAT_MESSAGES_TABLE)
      .select("id, body, sender_id, created_at")
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
    return null;
  }, []);

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
        setMatchId(mid);

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

  const hasOpenProposal = proposals.length > 0;
  const productState = getProductState({ hasProposal: proposals.length > 0 });
  const matchOpenedAt = conversationId ? getMatchOpenedAt(conversationId) : null;

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
    const latest = proposals[0];
    if (!latest) return null;
    return "Créneau proposé";
  }, [proposals]);

  async function sendActivity(payload: ActivityPayload) {
    if (!user?.id || !conversationId || !matchId) throw new Error("Non connecté");
    if (pairBlocked) throw new Error("Échange impossible avec ce profil.");

    const note = payload.message.trim();
    const pl = payload.place.trim();
    if (messageContainsDisallowedContent(note) || (pl.length > 0 && messageContainsDisallowedContent(pl))) {
      throw new Error(SAFETY_CONTENT_REFUSAL);
    }

    const { data: activeProposal, error: activeErr } = await supabase
    .from("activity_proposals")
    .select("id")
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();
    if (activeErr) throw new Error(activeErr.message);
    if (activeProposal?.id) return;

    const { timeLabel } = computeProposalSchedule(payload.when);

    const { error: proposalErr } = await supabase.from("activity_proposals").insert({
      conversation_id: conversationId,
      proposer_id: user.id,
      sport: payload.sport,
      time_slot: timeLabel,
      location: payload.place.trim() || "À définir",
      note: payload.message.trim() || null,
    });
    if (proposalErr) throw new Error(proposalErr.message);
    await reloadProposals(conversationId);
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
      <header className="shrink-0 border-b border-app-border/80 bg-app-card px-4 py-3">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            to="/discover"
            className="text-[13px] font-semibold text-[#FF1E2D] underline-offset-2 hover:underline"
          >
            Retour à Découvrir
          </Link>
        </div>
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
        <ChatPostMatchPanel
          productState={productState}
          matchOpenedAt={matchOpenedAt}
          windowExpiresAt={windowExpiresAt}
          nowTick={nowTick}
          onProposeClick={() => setModalOpen(true)}
          proposeDisabled={hasOpenProposal || pairBlocked}
          proposalStatusLabel={proposalStatusLabel}
          hideCardProposeButton
          onRelanceWindow={handleRelanceWindow}
          relanceBusy={relanceBusy}
        />

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
          {chatMessages.length > 0 ? (
            <div className="space-y-2">
              {chatMessages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div
                    key={m.id}
                    className={
                      mine
                        ? `ml-auto ${getOwnMessageBubbleClassName(messageBubbleTheme)}`
                        : "mr-auto max-w-[85%] rounded-2xl border border-app-border bg-app-card px-3.5 py-2.5 text-sm leading-snug text-app-text shadow-sm"
                    }
                  >
                    {m.body}
                  </div>
                );
              })}
            </div>
          ) : null}

          {proposals.length === 0 && chatMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-app-border bg-app-card/80 px-4 py-8 text-center">
              <p className="text-sm leading-relaxed text-app-muted">
                Ajoutez un détail pour lancer la sortie — proposer un vrai créneau reste possible quand vous voulez.
              </p>
            </div>
          ) : (
            proposals.map((p) => {
              const mine = p.proposer_id === user?.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border border-app-border bg-app-card px-4 py-3 shadow-sm ${
                    mine ? "ml-4 border-[#FF1E2D]/20" : "mr-4"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                    {mine ? "Votre créneau" : "Créneau"}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-app-text">{p.sport}</p>
<p className="mt-0.5 text-sm text-app-muted">
  {p.time_slot || "Créneau à confirmer"}
  {p.location ? ` • ${p.location}` : ""}
</p>
{p.note ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-snug text-app-text">{p.note}</p>
                  ) : null}
                  
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-app-border/80 bg-app-bg pt-3">
          {!canSendChatText && chatMessages.length === 0 ? (
            <p className="rounded-xl border border-app-border/90 bg-app-card px-3 py-2.5 text-[13px] leading-relaxed text-app-muted">
              {CHAT_FIRST_MESSAGE_HINT_HOMME}
            </p>
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
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder="Ajoutez un détail pour la sortie…"
                rows={2}
                disabled={sendingMessage || pairBlocked || !canSendChatText}
                enterKeyHint="send"
                autoComplete="off"
                className="min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:border-app-accent/40 focus:outline-none focus:ring-1 focus:ring-app-accent/20 disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={() => void sendChatMessage()}
              disabled={sendingMessage || pairBlocked || !draftMessage.trim() || !canSendChatText}
              className="group shrink-0 self-end flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
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
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={hasOpenProposal || pairBlocked}
            className="w-full rounded-xl border border-app-border bg-app-card py-3 text-sm font-semibold text-[#FF1E2D] shadow-sm transition hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            {hasOpenProposal ? "Un créneau est en cours" : "Proposer un créneau"}
          </button>
        </div>
      </main>

      <ActivityProposalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        sharedSports={sharedSports}
        onSubmit={async (p) => {
          await sendActivity(p);
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
