import type { LikeReceived } from "../types/premium.types";
import {
  BLOCK_PROFILE_LINK_LABEL,
  LIKES_YOU_LIKE,
  LIKES_YOU_PASS,
  REPORT_LINK_LABEL,
} from "../constants/copy";
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
  IconPass,
  IconProfileAvatarPlaceholder,
} from "./ui/Icon";

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
  onReport?: (profileId: string) => void;
  /** Retrait silencieux du flux (sans indication à l’autre personne). */
  onBlock?: (profileId: string) => void;
};

export function LikesYouProfileCard({ like, onLikeBack, onPass, onReport, onBlock }: Props) {
  const profile = like.profile;
  if (!profile) return null;
  const sports = getSports(like);
  const photo = profile.main_photo_url?.trim() ?? "";

  return (
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
      <div
        style={{
          width: "100%",
          aspectRatio: "3/4",
          background: photo
            ? `center/cover url(${photo})`
            : "linear-gradient(165deg, #18181B 0%, #2A2A2E 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!photo && (
          <IconProfileAvatarPlaceholder className="text-app-muted" size={96} />
        )}
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
            {profile.first_name ?? "Sans prénom"}
          </p>
          {isPhotoVerified(profile) ? <VerifiedBadge /> : null}
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
              margin: "0 0 10px 0",
              fontSize: "13px",
              color: BRAND_BG,
              fontWeight: 600,
            }}
          >
            {sports.join(" · ")}
          </p>
        )}
        {profile.sport_feeling && (
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "13px",
              color: APP_TEXT_MUTED,
            }}
          >
            « Le sport me fait me sentir <strong>{profile.sport_feeling}</strong> »
          </p>
        )}
        <div style={{ display: "flex", gap: "12px" }}>
          {onPass && (
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
              {LIKES_YOU_PASS}
            </button>
          )}
          {onLikeBack && (
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
              {LIKES_YOU_LIKE}
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
              {BLOCK_PROFILE_LINK_LABEL}
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
              {REPORT_LINK_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
