import { useMemo, useState } from "react";
import type { LikeReceived } from "../types/premium.types";
import { useTranslation } from "../i18n/useTranslation";
import { VerifiedBadge } from "./VerifiedBadge";
import { isPhotoVerified } from "../lib/profileVerification";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import {
  IconHeartFilled,
  IconHeartOutline,
  IconChatBubble,
  IconPass,
  IconProfileAvatarPlaceholder,
} from "./ui/Icon";
import { guidedProfileSentence } from "../lib/discoverCardCopy";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import { uniqueProfilePhotoRefsOrdered } from "../lib/profilePhotoSignedUrl";
import { ProfilePhotoViewerModal } from "./ProfilePhotoViewerModal";

function getSports(like: LikeReceived): string[] {
  const list = like.profile?.profile_sports ?? [];
  return list
    .map((ps) => (ps.sports?.label ? ps.sports.label : null))
    .filter((n): n is string => Boolean(n));
}

type Props = {
  like: LikeReceived;
  onLikeBack?: (profileId: string) => void;
  onPass?: (profileId: string) => void;
  onOpenConversation?: (profileId: string) => void;
  onViewProfile?: (like: LikeReceived) => void;
  onReport?: (profileId: string) => void;
  onReportPhoto?: (profileId: string) => void;
  /** Retrait silencieux du flux (sans indication à l’autre personne). */
  onBlock?: (profileId: string) => void;
};

export function LikesYouProfileCard({
  like,
  onLikeBack,
  onPass,
  onOpenConversation,
  onViewProfile,
  onReport,
  onReportPhoto,
  onBlock,
}: Props) {
  const { t } = useTranslation();
  const profile = like.profile;
  if (!profile) return null;
  const profileWithOptional = profile as {
    birth_date?: string | null;
    moment_preference?: string | null;
    reliability_label?: string | null;
  };
  const age = profileWithOptional.birth_date
    ? Math.floor(
        (Date.now() - new Date(profileWithOptional.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const sports = getSports(like).slice(0, 2);
  const momentPreference = profileWithOptional.moment_preference ?? profile.sport_time ?? "evening";
  const guided = guidedProfileSentence({
    sport_phrase: profile.sport_phrase,
    sport_feeling: profile.sport_feeling,
    firstCommonSport: sports[0] ?? null,
    genericFallback: t("likes.guided_fallback"),
  });
  const photoRaw = profile.main_photo_url?.trim() || null;
  const photo = useProfilePhotoSignedUrl(photoRaw) ?? "";
  const galleryRawRefs = useMemo(
    () => uniqueProfilePhotoRefsOrdered(profile),
    [profile.id, profile.main_photo_url, profile.portrait_url, profile.fullbody_url],
  );
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const mainGalleryIndex = useMemo(() => {
    if (!photoRaw) return 0;
    const i = galleryRawRefs.indexOf(photoRaw);
    return i >= 0 ? i : 0;
  }, [photoRaw, galleryRawRefs]);
  const hasExistingRelation = Boolean(like.is_match || like.conversation_id || like.match_id);
  const conversationLabel = like.conversation_id
    ? t("likes.continue_chat")
    : t("likes.open_conversation");
  const reliabilityBadge = (() => {
    const raw = String(profileWithOptional.reliability_label ?? "").toLowerCase().trim();
    if (raw === "high") return { label: t("likes.reliability_high"), bg: "#10B981" };
    if (raw === "low") return { label: t("likes.reliability_low"), bg: "#EF4444" };
    return { label: t("likes.reliability_medium"), bg: "#F59E0B" };
  })();
  const displayName = profile.first_name?.trim() || t("likes.unnamed");
  const photoAlt = profile.first_name?.trim()
    ? t("likes.photo_alt", { name: profile.first_name.trim() })
    : t("likes.profile_photo_alt");

  return (
    <>
    <div
      style={{
        borderRadius: "20px",
        overflow: "hidden",
        marginBottom: "24px",
        background: APP_CARD,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        border: `1px solid ${APP_BORDER}`,
      }}
    >
      <div className="relative flex w-full items-center justify-center" style={{ aspectRatio: "3/4" }}>
        {photo ? (
          <img
            src={photo}
            alt={photoAlt}
            className="h-full w-full cursor-pointer object-cover"
            onClick={() => setPhotoViewerOpen(true)}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(165deg, #18181B 0%, #2A2A2E 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconProfileAvatarPlaceholder className="text-app-muted" size={96} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <p className="text-base font-semibold leading-tight">
            {displayName}
            {age != null ? `, ${age}` : ""}
          </p>
          <p className="line-clamp-2 truncate text-sm opacity-90">{sports.join(" • ")}</p>
          <p className="text-xs opacity-80">
            {momentPreference === "morning" ? t("likes.moment_morning") : t("likes.moment_evening")}
          </p>
        </div>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <div
          style={{
            margin: "0 0 6px 0",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 600,
              color: APP_TEXT,
            }}
          >
            {displayName}
          </p>
          {isPhotoVerified(profile) ? <VerifiedBadge /> : null}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "999px",
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#FFFFFF",
              background: reliabilityBadge.bg,
            }}
          >
            {reliabilityBadge.label}
          </span>
        </div>
        {profile.city && (
          <p
            style={{
              margin: "0 0 10px 0",
              fontSize: "14px",
              color: APP_TEXT_MUTED,
            }}
          >
            {profile.city}
          </p>
        )}
        {sports.length > 0 && (
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: "13px",
              color: BRAND_BG,
              fontWeight: 600,
            }}
          >
            {sports.join(" · ")}
          </p>
        )}
        <p
          style={{
            margin: "0 0 12px 0",
            fontSize: "14px",
            lineHeight: 1.45,
            color: APP_TEXT,
            fontWeight: 500,
          }}
        >
          {guided}
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          {onViewProfile && (
            <button
              type="button"
              onClick={() => onViewProfile(like)}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: `1px solid ${APP_BORDER}`,
                background: "transparent",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
                color: APP_TEXT_MUTED,
              }}
            >
              {t("likes.view_profile")}
            </button>
          )}
          {!hasExistingRelation && onPass && (
            <button
              type="button"
              onClick={() => onPass(profile.id)}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: `1px solid ${APP_BORDER}`,
                background: "transparent",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
                color: APP_TEXT_MUTED,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <IconPass size={20} />
              {t("likes.pass")}
            </button>
          )}
          {!hasExistingRelation && onLikeBack && (
            <button
              type="button"
              onClick={() => onLikeBack(profile.id)}
              className="group"
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: BRAND_BG,
                color: TEXT_ON_BRAND,
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  position: "relative",
                  display: "inline-flex",
                  width: 20,
                  height: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconHeartOutline
                  size={20}
                  color="currentColor"
                  style={{
                    position: "absolute",
                    transition: "opacity 0.15s ease",
                  }}
                  className="opacity-100 group-active:opacity-0"
                />
                <IconHeartFilled
                  size={20}
                  color="currentColor"
                  style={{
                    position: "absolute",
                    transition: "opacity 0.15s ease",
                  }}
                  className="opacity-0 group-active:opacity-100"
                />
              </span>
              {t("likes.like")}
            </button>
          )}
          {hasExistingRelation && onOpenConversation && (
            <button
              type="button"
              onClick={() => onOpenConversation(profile.id)}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: BRAND_BG,
                color: TEXT_ON_BRAND,
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <IconChatBubble size={19} />
              {conversationLabel}
            </button>
          )}
        </div>
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {onBlock && (
            <button
              type="button"
              onClick={() => onBlock(profile.id)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: APP_TEXT_MUTED,
                fontSize: "13px",
                cursor: "pointer",
                textDecoration: "underline",
                textAlign: "left",
              }}
            >
              {t("likes.hide_profile")}
            </button>
          )}
          {onReport && (
            <button
              type="button"
              onClick={() => onReport(profile.id)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: APP_TEXT_MUTED,
                fontSize: "13px",
                cursor: "pointer",
                textDecoration: "underline",
                textAlign: "left",
              }}
            >
              {t("likes.report_profile")}
            </button>
          )}
          {onReportPhoto && (
            <button
              type="button"
              onClick={() => onReportPhoto(profile.id)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: APP_TEXT_MUTED,
                fontSize: "13px",
                cursor: "pointer",
                textDecoration: "underline",
                textAlign: "left",
              }}
            >
              {t("likes.report_photo")}
            </button>
          )}
        </div>
      </div>
    </div>
    <ProfilePhotoViewerModal
      isOpen={photoViewerOpen}
      onClose={() => setPhotoViewerOpen(false)}
      rawRefs={galleryRawRefs}
      initialIndex={mainGalleryIndex}
      nameForAlt={profile.first_name?.trim() || null}
    />
    </>
  );
}
