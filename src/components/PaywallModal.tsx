import {
  PAYWALL_TITLE,
  PAYWALL_SUBTITLE,
  PAYWALL_BULLETS,
  PAYWALL_PRICE_LABEL,
  PAYWALL_CTA_PRIMARY,
  PAYWALL_CTA_SECONDARY,
  PAYWALL_LEGAL,
  PAYWALL_CONTEXT,
} from "../constants/copy";
import { PAYWALL_FEATURES, PAYWALL_PRICE_MONTHLY, PAYWALL_PRICE_PERIOD } from "../constants/premium";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import { IconFeatureCheck } from "./FunctionalIcons";

type Props = {
  onClose: () => void;
  featureName?: keyof typeof PAYWALL_CONTEXT;
};

export function PaywallModal({ onClose, featureName }: Props) {
  const context = featureName && PAYWALL_CONTEXT[featureName];
  const title = context ? context.title : PAYWALL_TITLE;
  const subtitle = context ? context.subtitle : PAYWALL_SUBTITLE;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: APP_CARD,
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
          width: "100%",
          maxWidth: "420px",
          maxHeight: "90vh",
          overflowY: "auto",
          borderTop: `1px solid ${APP_BORDER}`,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "28px 24px 32px" }}>
          <h2
            style={{
              margin: "0 0 8px 0",
              fontSize: "22px",
              fontWeight: 700,
              color: APP_TEXT,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: "0 0 20px 0",
              fontSize: "15px",
              color: APP_TEXT_MUTED,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>

          <ul
            style={{
              margin: "0 0 24px 0",
              paddingLeft: "20px",
              fontSize: "14px",
              color: APP_TEXT_MUTED,
              lineHeight: 1.6,
            }}
          >
            {PAYWALL_BULLETS.map((text, i) => (
              <li key={i} style={{ marginBottom: "6px" }}>
                {text}
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
            {PAYWALL_FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 16px",
                  background: "#0F0F14",
                  borderRadius: "14px",
                  border: "1px solid #2A2A2E",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    marginBottom: "4px",
                  }}
                >
                  <IconFeatureCheck className="mt-0.5 shrink-0 text-app-muted" size={24} />
                  <p
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: 600,
                      color: APP_TEXT,
                    }}
                  >
                    {f.title}
                  </p>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: APP_TEXT_MUTED,
                    lineHeight: 1.4,
                  }}
                >
                  {f.line}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "16px",
              background: "#0F0F14",
              borderRadius: "14px",
              marginBottom: "24px",
              textAlign: "center",
              border: `1px solid ${APP_BORDER}`,
            }}
          >
            <p style={{ margin: 0, fontSize: "12px", color: APP_TEXT_MUTED, marginBottom: "4px" }}>
              {PAYWALL_PRICE_LABEL}
            </p>
            <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: APP_TEXT }}>
              {PAYWALL_PRICE_MONTHLY} € <span style={{ fontSize: "14px", fontWeight: 500 }}>/ {PAYWALL_PRICE_PERIOD}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "14px",
              border: "none",
              background: BRAND_BG,
              color: TEXT_ON_BRAND,
              fontWeight: 600,
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            {PAYWALL_CTA_PRIMARY}
          </button>
          <button
            onClick={onClose}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "12px",
              border: "none",
              background: "transparent",
              color: APP_TEXT_MUTED,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {PAYWALL_CTA_SECONDARY}
          </button>

          <p
            style={{
              margin: "20px 0 0 0",
              fontSize: "12px",
              color: APP_TEXT_MUTED,
              lineHeight: 1.5,
            }}
          >
            {PAYWALL_LEGAL}
          </p>
        </div>
      </div>
    </div>
  );
}
