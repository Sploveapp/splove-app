import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePremium } from "../hooks/usePremium";
import { useLikesReceived } from "../hooks/useLikesReceived";
import { BlurredProfileCard } from "../components/BlurredProfileCard";
import { LikesYouProfileCard } from "../components/LikesYouProfileCard";
import { PaywallModal } from "../components/PaywallModal";
import { ReportModal } from "../components/ReportModal";
import { ReportPhotoModal } from "../components/ReportPhotoModal";
import { supabase } from "../lib/supabase";
import { BETA_MODE } from "../constants/beta";
import {
  BLOCK_PROFILE_CONFIRM,
  LIKES_YOU_TITLE,
  LIKES_YOU_LOADING,
  LIKES_YOU_EMPTY,
  ERROR_GENERIC,
} from "../constants/copy";
import { insertBlock } from "../services/blocks.service";

export default function LikesYou() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? "";
  const { hasPlus, isLoading: premiumLoading } = usePremium(currentUserId);
  const { list, setList, loading, error } = useLikesReceived(currentUserId);
  const [showPaywall, setShowPaywall] = useState(false);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [reportPhotoTarget, setReportPhotoTarget] = useState<{
    profileId: string;
    portraitUrl: string | null;
    fullbodyUrl: string | null;
  } | null>(null);

  function openPhotoReport(profileId: string) {
    const item = list.find((l) => l.profile?.id === profileId);
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

        {(premiumLoading || loading) && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>{LIKES_YOU_LOADING}</p>
        )}

        {error && (
          <p style={{ color: "#dc2626", fontSize: "14px" }}>{error || ERROR_GENERIC}</p>
        )}

        {!premiumLoading && !loading && list.length === 0 && (
          <p style={{ color: "#64748b", fontSize: "15px" }}>{LIKES_YOU_EMPTY}</p>
        )}

        {!premiumLoading && !loading && list.length > 0 && !hasPlus &&
          list.map((like) => (
            <BlurredProfileCard
              key={like.id}
              like={like}
              onUnlock={() => setShowPaywall(true)}
            />
          ))}

        {!premiumLoading && !loading && list.length > 0 && hasPlus &&
          list.map((like) => (
            <LikesYouProfileCard
  key={like.id}
  like={like}
  onLikeBack={async (profileId) => {
    if (!currentUserId) return;

    const { error: likeError } = await supabase
      .from("likes")
      .upsert(
        {
          liker_id: currentUserId,
          liked_id: profileId,
        },
        {
          onConflict: "liker_id,liked_id",
          ignoreDuplicates: true,
        }
      );

    if (likeError) {
      alert("Erreur like back : " + likeError.message);
      return;
    }

    const { data: reverseLike, error: reverseError } = await supabase
      .from("likes")
      .select("id")
      .eq("liker_id", profileId)
      .eq("liked_id", currentUserId)
      .maybeSingle();

    if (reverseError) {
      alert("Erreur vérification match : " + reverseError.message);
      return;
    }

    if (reverseLike) {
      const [userA, userB] = [currentUserId, profileId].sort();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const { error: matchError } = await supabase.from("matches").insert({
        user_a: userA,
        user_b: userB,
        status: "active",
        expires_at: expiresAt,
      });

      if (matchError) {
        alert("Erreur création match : " + matchError.message);
        return;
      }
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
  onReport={(profileId) => setReportProfileId(profileId)}
  onReportPhoto={(profileId) => openPhotoReport(profileId)}
  onBlock={(profileId) => void handleBlockProfile(profileId)}
/>
          ))}
      </main>

      {showPaywall && !BETA_MODE && (
        <PaywallModal
          featureName="likes_you"
          onClose={() => setShowPaywall(false)}
        />
      )}

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
