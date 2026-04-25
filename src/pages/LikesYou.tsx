import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLikesReceived } from "../hooks/useLikesReceived";
import { LikesYouProfileCard } from "../components/LikesYouProfileCard";
import { ReportModal } from "../components/ReportModal";
import { ReportPhotoModal } from "../components/ReportPhotoModal";
import { supabase } from "../lib/supabase";
import {
  BLOCK_PROFILE_CONFIRM,
  LIKES_YOU_TITLE,
  LIKES_YOU_LOADING,
  ERROR_GENERIC,
} from "../constants/copy";
import { insertBlock } from "../services/blocks.service";
import {
  fetchConversationIdForUserPair,
  normalizeCreateLikeRpcResult,
  rpcPayloadIndicatesLikeSuccess,
} from "../services/likes.service";

export default function LikesYou() {
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
    if (!window.confirm(BLOCK_PROFILE_CONFIRM)) return;
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
          {LIKES_YOU_TITLE}
        </h1>

        {loading && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>{LIKES_YOU_LOADING}</p>
        )}

        {error && (
          <p style={{ color: "#dc2626", fontSize: "14px" }}>{error || ERROR_GENERIC}</p>
        )}

        {!loading && likesForRender.length === 0 && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>Personne ne t’a liké pour l’instant.</p>
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
      alert(e instanceof Error ? e.message : "Erreur réseau");
      return;
    }

    if (rpcError && (data === null || data === undefined)) {
      alert("Erreur like : " + rpcError.message);
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
  onViewProfile={(profileId) => {
    navigate("/discover", { state: { openProfileId: profileId } });
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
    </div>
  );
}
