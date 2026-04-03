import { useNavigate } from "react-router-dom";
import { BRAND_BG } from "../constants/theme";

export default function Activity() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100%",
        background: "#0F0F14",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <main
        style={{
          padding: "24px",
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px 0",
            fontSize: "22px",
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          Activité
        </h1>
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "15px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Vos sports et votre dynamique de rencontres apparaîtront ici. En attendant,
          affinez votre profil ou découvrez des profils qui partagent vos sports.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate("/discover")}
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: "none",
              background: BRAND_BG,
              color: "rgba(255,255,255,0.95)",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Découvrir
          </button>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid #2A2A2E",
              background: "#fff",
              color: "#334155",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Mon profil
          </button>
          <button
            type="button"
            onClick={() => navigate("/splove-plus")}
            style={{
              padding: "12px 18px",
              borderRadius: 14,
              border: "none",
              background: "transparent",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            SPLove+
          </button>
        </div>
      </main>
    </div>
  );
}
