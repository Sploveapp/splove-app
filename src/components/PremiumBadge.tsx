import { BADGE_PLUS_LABEL, BADGE_PLUS_TOOLTIP } from "../constants/copy";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

export function PremiumBadge() {
  return (
    <span
      title={BADGE_PLUS_TOOLTIP}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: "8px",
        background: BRAND_BG,
        color: TEXT_ON_BRAND,
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {BADGE_PLUS_LABEL}
    </span>
  );
}
