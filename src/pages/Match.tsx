import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { ActivityProposalModal } from "../components/ActivityProposalModal";
import { PriorityProposalUpsell } from "../components/PriorityProposalUpsell";
import type { ActivityPayload } from "../lib/chatActivity";
import { COPY_BANNER_48H, computeProposalSchedule, touchMatchOpenedAt } from "../lib/chatActivity";
import { matchMomentumLine } from "../lib/discoverCardCopy";
import { ensureConversationWindow } from "../lib/ensureConversationWindow";
import { BETA_MODE } from "../constants/beta";
import { buildCreateActivityProposalRpcArgs } from "../lib/messages/activityProposalMutations";
import { createAutoProposalForMatchIfEligible } from "../services/activityProposals.service";
import { useTranslation } from "../i18n/useTranslation";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import ReferralModal from "../components/referral/ReferralModal";
import { getOrCreateReferralCode, getReferralVariant } from "../lib/referral";
import { MatchActivitySuggestionCard } from "../components/MatchActivitySuggestionCard";
import {
  getActivitySuggestion,
  isActivitySuggestionDismissedInStorage,
  setActivitySuggestionDismissedInStorage,
} from "../lib/matchActivitySuggestion";
import { fetchPairSportPracticeTypes } from "../lib/matchPairPracticeTypes";

export type MatchLocationState = {
  partnerFirstName?: string | null;
  /** Photo principale du match (même source que Discover : `main_photo_url`). */
  partnerMainPhotoUrl?: string | null;
  /** User qui a déclenché le match (2e like côté RPC). */
  matchedByUserId?: string | null;
  sharedSports?: string[];
  partnerSportPracticeType?: string | null;
};

export default function Match() {
  const { t, language } = useTranslation();
  const { user, profile } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as MatchLocationState | null;
  const partnerName = state?.partnerFirstName?.trim() || null;
  const partnerPhoto = state?.partnerMainPhotoUrl?.trim() || null;
  const partnerPhotoDisplay = useProfilePhotoSignedUrl(partnerPhoto);
  const matchedByUserId = state?.matchedByUserId ?? null;
  const sharedSports = state?.sharedSports ?? [];
  const momentum = matchMomentumLine(sharedSports);

  const [minePracticeType, setMinePracticeType] = useState<string | null>(() => {
    const raw = profile && typeof profile === "object" ? (profile as { sport_practice_type?: unknown }).sport_practice_type : null;
    return typeof raw === "string" && raw.trim() ? raw : null;
  });
  const [partnerPracticeType, setPartnerPracticeType] = useState<string | null>(
    typeof state?.partnerSportPracticeType === "string" && state.partnerSportPracticeType.trim()
      ? state.partnerSportPracticeType.trim()
      : null,
  );
  const [suggestionDismissed, setSuggestionDismissed] = useState(() =>
    conversationId ? isActivitySuggestionDismissedInStorage(conversationId) : false,
  );

  useEffect(() => {
    setSuggestionDismissed(conversationId ? isActivitySuggestionDismissedInStorage(conversationId) : false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    let cancelled = false;
    void (async () => {
      const rows = await fetchPairSportPracticeTypes({ conversationId, currentUserId: user.id });
      if (cancelled || !rows) return;
      setMinePracticeType(rows.mine);
      setPartnerPracticeType((prev) => rows.partner ?? prev);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.id]);

  useEffect(() => {
    const raw = profile && typeof profile === "object" ? (profile as { sport_practice_type?: unknown }).sport_practice_type : null;
    if (typeof raw === "string" && raw.trim()) setMinePracticeType(raw.trim());
  }, [profile]);

  const [modalOpen, setModalOpen] = useState(false);
  const [proposalModalFromSuggestion, setProposalModalFromSuggestion] = useState(false);
  const [activeProposalStatus, setActiveProposalStatus] = useState<string | null>(null);

  const sharedSportLabel = sharedSports[0]?.trim() ?? "";
  const suggestion = useMemo(
    () =>
      getActivitySuggestion({
        sharedSport: sharedSportLabel || "—",
        currentUserPracticeType: minePracticeType,
        matchedUserPracticeType: partnerPracticeType,
        locale: language,
      }),
    [language, minePracticeType, partnerPracticeType, sharedSportLabel],
  );

  const showActivitySuggestionCard =
    Boolean(sharedSportLabel) && !activeProposalStatus && !suggestionDismissed;
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [referralCodeMatch, setReferralCodeMatch] = useState<string | null>(null);
  const matchReferralVariant = useMemo(
    () => (user?.id ? getReferralVariant(user.id) : "A"),
    [user?.id],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void getOrCreateReferralCode(user.id, profile?.first_name ?? null).then((c) => {
      if (!cancelled) setReferralCodeMatch(c);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.first_name]);

  useEffect(() => {
    if (conversationId) touchMatchOpenedAt(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    void ensureConversationWindow({
      conversationId,
      userId: user.id,
      matchedByUserId,
    });
  }, [conversationId, matchedByUserId, user?.id]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    void createAutoProposalForMatchIfEligible({
      conversationId,
      currentUserId: user.id,
    }).catch((e) => {
      console.warn("[Match] auto proposal skipped:", e);
    });
  }, [conversationId, user?.id]);

  useEffect(() => {
    async function loadActiveProposal() {
      if (!conversationId) return;
      const { data } = await supabase
        .from("activity_proposals")
        .select("id")
        .eq("conversation_id", conversationId)
        .or("status.eq.pending,status.eq.proposed")
        .limit(1)
        .maybeSingle();
      
      setActiveProposalStatus((data as { id?: string } | null)?.id ? "exists" : null);
    }
    void loadActiveProposal();
  }, [conversationId, modalOpen]);

  if (!conversationId) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        {t("conversation_not_found")}
      </div>
    );
  }

  async function sendActivity(payload: ActivityPayload) {
    if (!user?.id) throw new Error(t("not_connected"));
    if (!conversationId) throw new Error(t("conversation_not_found"));
    const { timeLabel } = computeProposalSchedule(payload.when);
    console.log("[Activity] create proposal", {
      conversation_id: conversationId,
      sport: payload.sport,
      time_slot: timeLabel,
      location: payload.place.trim() || "À définir",
      note: payload.message.trim() || null,
    });
    console.log("[Chat] création activité", { conversationId, timeSlot: timeLabel });
    const { error: proposalErr } = await supabase.rpc(
      "create_activity_proposal",
      buildCreateActivityProposalRpcArgs({
        conversationId,
        sport: payload.sport,
        timeSlot: timeLabel,
        location: payload.place.trim() || "À définir",
        note: payload.message.trim() || null,
      }),
    );
    if (proposalErr) {
      console.error("[Chat] création activité erreur", proposalErr);
      throw new Error(proposalErr.message);
    }
  }

  function goChat() {
    try {
      sessionStorage.setItem(
        `splove_conv_sports_${conversationId}`,
        JSON.stringify(sharedSports)
      );
    } catch {
      /* ignore quota */
    }
    navigate(`/chat/${conversationId}`, {
      replace: true,
      state: {
        partnerFirstName: partnerName,
        partnerMainPhotoUrl: partnerPhoto,
        sharedSports,
        matchedByUserId,
        partnerSportPracticeType: partnerPracticeType,
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg font-sans">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="rounded-3xl border border-app-border bg-app-card px-6 py-10 text-center shadow-sm ring-1 ring-app-border">
          {partnerPhoto && (
            <div className="mx-auto w-28 overflow-hidden rounded-2xl ring-2 ring-app-border">
              {partnerPhotoDisplay ? (
                <img
                  src={partnerPhotoDisplay}
                  alt={partnerName ? `${t("photo_of")} ${partnerName}` : t("profile_photo")}
                  className="aspect-[3/4] h-full w-full object-cover"
                />
              ) : (
                <div className="aspect-[3/4] w-full bg-app-border" />
              )}
            </div>
          )}
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-app-muted">{t("match")}</p>
          <h1 className="mt-2 text-[1.35rem] font-bold leading-snug tracking-tight text-app-text sm:text-2xl">
            {t("move_to_real")}
          </h1>
          {partnerName && (
            <p className="mt-2 text-[15px] font-medium text-app-text">
              {t("chat_with")} {partnerName}
              {sharedSports.length > 0 ? (
                <span className="block pt-1 text-[13px] font-semibold text-[#FF1E2D]">
                  {sharedSports.slice(0, 3).join(" · ")}
                </span>
              ) : null}
            </p>
          )}
          <p className="mt-5 rounded-xl border border-app-accent/25 bg-app-bg/80 px-3 py-3 text-[14px] font-medium leading-relaxed text-app-text">
            {t("momentum_point")} - {momentum}
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-app-muted">{COPY_BANNER_48H}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-app-muted">
            {t("no_novel_needed")}
          </p>
          {showActivitySuggestionCard ? (
            <div className="mt-5 text-left">
              <MatchActivitySuggestionCard
                suggestion={suggestion}
                tone={suggestion.tone}
                sectionLabel={t("match_suggestion.section_label")}
                proposeLabel={t("match_suggestion.use_idea_cta")}
                chooseOtherLabel={t("match_suggestion.other_cta")}
                onPropose={() => {
                  setProposalModalFromSuggestion(true);
                  setModalOpen(true);
                }}
                onChooseOther={() => {
                  if (conversationId) setActivitySuggestionDismissedInStorage(conversationId);
                  setSuggestionDismissed(true);
                }}
              />
            </div>
          ) : null}
          {activeProposalStatus && (
            <p className="mt-3 inline-flex rounded-full bg-[#FF1E2D]/10 px-3 py-1 text-[12px] font-semibold text-[#FF1E2D]">
              {t("activity_proposal_in_progress")}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setProposalModalFromSuggestion(false);
                setModalOpen(true);
              }}
              className="w-full rounded-2xl py-3.5 text-[15px] font-bold shadow-md transition hover:opacity-95"
              style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              {t("propose_activity")}
            </button>
            <button
              type="button"
              onClick={goChat}
              className="w-full rounded-2xl border border-app-border bg-app-card py-3.5 text-[15px] font-semibold text-app-text hover:bg-app-border"
            >
              {t("send_message")}
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-[#FF1E2D]/25 bg-[#0f0f14]/80 px-4 py-4 text-left ring-1 ring-white/[0.04]">
            <p className="text-[14px] font-bold text-app-text">🔥 Bon début...</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-app-muted">
              Fais venir quelqu’un et multiplie tes chances de match
            </p>
            <p className="mt-2 text-[12px] font-semibold text-[#FF1E2D]">Boost offert pour vous deux</p>
            <button
              type="button"
              onClick={() => setReferralModalOpen(true)}
              className="mt-3 w-full rounded-xl border border-app-border bg-app-card py-2.5 text-[14px] font-bold text-app-text transition hover:bg-app-border"
            >
              Accélérer mes matchs
            </button>
          </div>
          {!BETA_MODE ? (
            <div className="mt-4 text-left">
              <PriorityProposalUpsell
                onActivate={() => navigate("/splove-plus")}
                onStayFree={() => goChat()}
              />
            </div>
          ) : null}
        </div>
      </main>

      <ActivityProposalModal
        open={modalOpen}
        onClose={() => {
          setProposalModalFromSuggestion(false);
          setModalOpen(false);
        }}
        sharedSports={sharedSports}
        titleOverride={proposalModalFromSuggestion ? suggestion.title : undefined}
        descriptionOverride={proposalModalFromSuggestion ? suggestion.subtitle : undefined}
        initialSport={proposalModalFromSuggestion ? sharedSportLabel || undefined : undefined}
        onSubmit={async (p) => {
          await sendActivity(p);
          goChat();
        }}
      />

      <ReferralModal
        open={referralModalOpen}
        onClose={() => setReferralModalOpen(false)}
        referralCode={referralCodeMatch}
        variant={matchReferralVariant}
      />
    </div>
  );
}
