import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLikesReceived } from "../hooks/useLikesReceived";
import { LikesYouProfileCard } from "../components/LikesYouProfileCard";
import { ReportModal } from "../components/ReportModal";
import { ReportPhotoModal } from "../components/ReportPhotoModal";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { IconChatBubble, IconProfileAvatarPlaceholder } from "../components/ui/Icon";
import { isPhotoVerified } from "../lib/profileVerification";
import { guidedProfileSentence } from "../lib/discoverCardCopy";
import { APP_BORDER, APP_CARD, APP_TEXT, APP_TEXT_MUTED, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { supabase } from "../lib/supabase";
import { insertBlock } from "../services/blocks.service";
import { useTranslation } from "../i18n/useTranslation";
import {
  fetchConversationIdForUserPair,
  normalizeCreateLikeRpcResult,
  rpcPayloadIndicatesLikeSuccess,
} from "../services/likes.service";
import type { LikeReceived, ProfileInLikesYou } from "../types/premium.types";

type LikesPreviewProfile = ProfileInLikesYou & {
  birth_date?: string | null;
  moment_preference?: string | null;
  reliability_label?: string | null;
  intent?: string | null;
};

export default function LikesYou() {
  const { t } = useTranslation();
  const { user, profile, isAuthInitialized } = useAuth();
  const navigate = useNavigate();
  const currentUserId = isAuthInitialized && user?.id ? user.id : null;
  const { list, setList, loading, error } = useLikesReceived(
    currentUserId,
    profile?.gender ?? null,
    profile?.looking_for ?? null,
  );

  /** Seule source pour le map : le state du hook (déjà filtré côté service). */
  const likesForRender = list;

  console.log(
    "[LikesYou FINAL RENDER]",
    likesForRender.length,
    likesForRender.map((x) => x.profile?.first_name ?? null),
  );

  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [reportPhotoTarget, setReportPhotoTarget] = useState<{
    profileId: string;
    portraitUrl: string | null;
    fullbodyUrl: string | null;
  } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<LikesPreviewProfile | null>(null);
  const [profilePreviewLoading, setProfilePreviewLoading] = useState(false);

  function openPhotoReport(profileId: string) {
    const item = likesForRender.find((l) => l.profile?.id === profileId);
    const p = item?.profile;
    if (!p) return;
    setReportPhotoTarget({
      profileId,
      portraitUrl: String(p.portrait_url ?? p.main_photo_url ?? "").trim() || null,
      fullbodyUrl: String(p.fullbody_url ?? "").trim() || null,
    });
  }

  async function handleBlockProfile(profileId: string) {
    if (!currentUserId) return;
    if (!window.confirm(t("block_profile_confirm"))) return;
    const { error } = await insertBlock(currentUserId, profileId);
    if (error) {
      console.error("[LikesYou] block:", error);
      return;
    }
    setList((prev) => prev.filter((item) => item.profile?.id !== profileId));
  }

  async function handleOpenConversation(profileId: string) {
    if (!currentUserId) return;
    const item = likesForRender.find((l) => l.profile?.id === profileId);
    if (!item) return;

    const knownConversationId = item.conversation_id ?? null;
    if (knownConversationId) {
      navigate(`/chat/${knownConversationId}`);
      return;
    }

    const resolvedConversationId = await fetchConversationIdForUserPair(currentUserId, profileId);
    if (resolvedConversationId) {
      setList((prev) =>
        prev.map((entry) =>
          entry.profile?.id === profileId ? { ...entry, conversation_id: resolvedConversationId } : entry,
        ),
      );
      navigate(`/chat/${resolvedConversationId}`);
      return;
    }

    navigate("/messages");
  }

  async function handleViewProfile(like: LikeReceived) {
    console.log("LIKES_SELECTED_PROFILE", like);
    const withJoins = like as LikeReceived & {
      profiles?: LikesPreviewProfile | null;
      user?: LikesPreviewProfile | null;
      liker?: LikesPreviewProfile | null;
    };
    const fromLike =
      withJoins.profiles ?? like.profile ?? withJoins.user ?? withJoins.liker ?? null;
    console.log("PROFILE_FOR_MODAL", withJoins.profiles);
    setProfilePreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", like.liker_id)
        .single();
      if (data && !error) {
        setSelectedProfile(data as unknown as LikesPreviewProfile);
        return;
      }
      if (error) {
        console.warn("[LikesYou] profile fetch for preview:", error.message);
      }
      if (
        fromLike &&
        typeof fromLike === "object" &&
        "id" in fromLike &&
        (fromLike as { id: string }).id === like.liker_id
      ) {
        setSelectedProfile(fromLike as LikesPreviewProfile);
      }
    } finally {
      setProfilePreviewLoading(false);
    }
  }

  function closeProfilePreview() {
    setSelectedProfile(null);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F0F14",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <main style={{ padding: "24px", maxWidth: "420px", margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            fontWeight: 600,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("likes.page_title")}
        </h1>

        {loading && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>{t("likes.loading")}</p>
        )}
        {profilePreviewLoading ? (
          <p style={{ color: "#64748b", fontSize: "13px", marginTop: "-12px", marginBottom: "14px" }}>
            {t("loading")}
          </p>
        ) : null}

        {error && (
          <p style={{ color: "#dc2626", fontSize: "14px" }}>{error || t("error")}</p>
        )}

        {!loading && likesForRender.length === 0 && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>{t("likes_you_empty")}</p>
        )}

        {!loading && likesForRender.length > 0 &&
          likesForRender.map((like) => (
            <LikesYouProfileCard
  key={like.id}
  like={like}
  onLikeBack={async (profileId) => {
    if (!currentUserId) return;

    /** Même RPC que Discover : like + match réciproque idempotent (`ON CONFLICT` sur matches). */
    let data: unknown;
    let rpcError: { message?: string } | null;
    try {
      const res = await supabase.rpc("create_like_and_get_result", { p_liked_id: profileId });
      data = res.data;
      rpcError = res.error;
    } catch (e) {
      alert(e instanceof Error ? e.message : t("likes.error_network"));
      return;
    }

    if (rpcError && (data === null || data === undefined)) {
      alert(`${t("like_error_prefix")} ${rpcError.message ?? ""}`.trim());
      return;
    }

    const parsed = normalizeCreateLikeRpcResult(data);
    if (!rpcPayloadIndicatesLikeSuccess(parsed) && !rpcError) {
      console.warn("[LikesYou] create_like_and_get_result: réponse inattendue", data);
    }

    setList((prev: typeof list) =>
      prev.filter((item) => item.profile?.id !== profileId)
    );
  }}
  onPass={(profileId) => {
    setList((prev: typeof list) =>
      prev.filter((item) => item.profile?.id !== profileId)
    );
  }}
  onOpenConversation={(profileId) => {
    void handleOpenConversation(profileId);
  }}
  onViewProfile={(viewLike) => {
    void handleViewProfile(viewLike);
  }}
  onReport={(profileId) => setReportProfileId(profileId)}
  onReportPhoto={(profileId) => openPhotoReport(profileId)}
  onBlock={(profileId) => void handleBlockProfile(profileId)}
/>
          ))}
      </main>

      {reportProfileId && currentUserId && (
        <ReportModal
          reportedProfileId={reportProfileId}
          reporterId={currentUserId}
          onClose={() => setReportProfileId(null)}
        />
      )}

      {reportPhotoTarget && currentUserId && (
        <ReportPhotoModal
          reportedUserId={reportPhotoTarget.profileId}
          reporterUserId={currentUserId}
          portraitUrl={reportPhotoTarget.portraitUrl}
          fullbodyUrl={reportPhotoTarget.fullbodyUrl}
          onClose={() => setReportPhotoTarget(null)}
        />
      )}

      {selectedProfile ? (
        <LikesYouProfilePreviewModal
          profile={selectedProfile}
          onClose={closeProfilePreview}
          onOpenConversation={() => void handleOpenConversation(selectedProfile.id)}
          onReport={() => setReportProfileId(selectedProfile.id)}
          onReportPhoto={() => openPhotoReport(selectedProfile.id)}
          onBlock={() => void handleBlockProfile(selectedProfile.id)}
          t={t}
        />
      ) : null}
    </div>
  );
}

function LikesYouProfilePreviewModal({
  profile,
  onClose,
  onOpenConversation,
  onReport,
  onReportPhoto,
  onBlock,
  t,
}: {
  profile: LikesPreviewProfile;
  onClose: () => void;
  onOpenConversation: () => void;
  onReport: () => void;
  onReportPhoto: () => void;
  onBlock: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const primaryPhoto = [profile.main_photo_url, profile.portrait_url, profile.fullbody_url]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find(Boolean) || "";
  const secondaryPhoto = [profile.fullbody_url, profile.portrait_url, profile.main_photo_url]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find((x) => Boolean(x) && x !== primaryPhoto) || "";
  const sports = (profile.profile_sports ?? [])
    .map((ps) => ps.sports?.label ?? "")
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const guided = guidedProfileSentence({
    sport_phrase: profile.sport_phrase,
    sport_feeling: profile.sport_feeling,
    firstCommonSport: sports[0] ?? null,
    genericFallback: t("likes.guided_fallback"),
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-3xl"
        style={{ background: APP_CARD, border: `1px solid ${APP_BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid h-44 grid-cols-2 gap-0.5" style={{ background: APP_BORDER }}>
          <div className="relative min-h-0" style={{ background: APP_BORDER }}>
            {primaryPhoto ? (
              <img src={primaryPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: APP_BORDER }}>
                <IconProfileAvatarPlaceholder className="text-app-muted/80" size={56} />
              </div>
            )}
          </div>
          <div className="relative min-h-0" style={{ background: APP_BORDER }}>
            {secondaryPhoto ? (
              <img src={secondaryPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: APP_BORDER }}>
                <span className="text-[11px] font-medium" style={{ color: APP_TEXT_MUTED }}>
                  —
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2.5 overflow-hidden px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-tight" style={{ color: APP_TEXT }}>
              {profile.first_name ?? t("likes.unnamed")}
              {age != null ? <span style={{ color: APP_TEXT_MUTED }}>, {age}</span> : null}
            </h2>
            {isPhotoVerified(profile) ? <VerifiedBadge /> : null}
          </div>
          {sports.length > 0 ? (
            <div className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-hidden">
              {sports.map((name) => (
                <span
                  key={name}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="line-clamp-3 text-[13px] font-medium leading-snug" style={{ color: APP_TEXT }}>
            {guided}
          </p>
          <button
            type="button"
            className="mt-1 w-full rounded-2xl py-4 text-base font-bold shadow-lg transition hover:opacity-95 sm:text-[17px]"
            style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
            onClick={onOpenConversation}
          >
            <span className="inline-flex items-center gap-2">
              <IconChatBubble size={18} />
              {t("likes.continue_chat")}
            </span>
          </button>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              className="text-left text-[12px] underline underline-offset-2"
              style={{ color: APP_TEXT_MUTED }}
              onClick={onReport}
            >
              {t("likes.report_profile")}
            </button>
            <button
              type="button"
              className="text-left text-[12px] underline underline-offset-2"
              style={{ color: APP_TEXT_MUTED }}
              onClick={onReportPhoto}
            >
              {t("likes.report_photo")}
            </button>
            <button
              type="button"
              className="text-left text-[12px] underline underline-offset-2"
              style={{ color: APP_TEXT_MUTED }}
              onClick={onBlock}
            >
              {t("likes.hide_profile")}
            </button>
          </div>
          <button
            type="button"
            className="w-full rounded-xl border py-2.5 text-[13px] font-semibold transition hover:bg-app-border"
            style={{ borderColor: APP_BORDER, color: APP_TEXT, background: APP_CARD }}
            onClick={onClose}
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
