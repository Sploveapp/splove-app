import type { LikeReceived } from "../types/premium.types";
import { LIKES_YOU_BLUR_MESSAGE, LIKES_YOU_BLUR_CTA } from "../constants/copy";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import { IconProfileAvatarPlaceholder } from "./FunctionalIcons";

function getSports(like: LikeReceived): string[] {
  const list = like.profile?.profile_sports ?? [];
  return list
    .map((ps) => (ps.sports?.label ? ps.sports.label : null))
    .filter((n): n is string => Boolean(n));
}

type Props = {
  like: LikeReceived;
  onUnlock: () => void;
};

export function BlurredProfileCard({ like, onUnlock }: Props) {
  const profile = like.profile;
  const sports = getSports(like);

  return (
    <div
      style={{
        borderRadius: "20px",
        overflow: "hidden",
        marginBottom: "20px",
        background: APP_CARD,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        border: `1px solid ${APP_BORDER}`,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "3/4",
          background: "linear-gradient(165deg, #18181B 0%, #2A2A2E 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "blur(12px)",
          transform: "scale(1.05)",
        }}
      >
        <IconProfileAvatarPlaceholder className="text-app-muted opacity-70" size={88} />
      </div>
      <div
        style={{
          padding: "20px 24px",
          filter: "blur(6px)",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <p style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 600, color: APP_TEXT }}>
          {profile?.first_name ?? "Quelqu'un"}
        </p>
        {profile?.city && (
          <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: APP_TEXT_MUTED }}>
            {profile.city}
          </p>
        )}
        {sports.length > 0 && (
          <p style={{ margin: 0, fontSize: "13px", color: BRAND_BG, fontWeight: 600 }}>
            {sports.join(" · ")}
          </p>
        )}
      </div>
      <div
        style={{
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          background: APP_CARD,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: APP_TEXT_MUTED,
            textAlign: "center",
          }}
        >
          {LIKES_YOU_BLUR_MESSAGE}
        </p>
        <button
          onClick={onUnlock}
          style={{
            padding: "12px 24px",
            borderRadius: "14px",
            border: "none",
            background: BRAND_BG,
            color: TEXT_ON_BRAND,
            fontWeight: 600,
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          {LIKES_YOU_BLUR_CTA}
        </button>
      </div>
    </div>
  );
}
