import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GlobalHeader } from "../components/GlobalHeader";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}#/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setMessage({
        type: "success",
        text: "Si un compte existe pour cet email, vous recevrez un lien pour réinitialiser votre mot de passe.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Une erreur s'est produite.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F0F14",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <GlobalHeader />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "360px",
            background: "#ffffff",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          <h1
            style={{
              margin: "0 0 8px 0",
              fontSize: "20px",
              fontWeight: 700,
              color: "#0f172a",
              textAlign: "center",
            }}
          >
            Mot de passe oublié
          </h1>
          <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
            Entrez votre adresse email. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                fontSize: "16px",
                outline: "none",
              }}
            />
            {message && (
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: message.type === "error" ? "#dc2626" : "#059669",
                  lineHeight: 1.4,
                }}
              >
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: BRAND_BG,
                color: TEXT_ON_BRAND,
                fontWeight: 600,
                fontSize: "16px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? "Chargement…" : "Envoyer le lien"}
            </button>
          </form>

          <Link
            to="/auth"
            style={{
              display: "block",
              marginTop: "20px",
              textAlign: "center",
              fontSize: "14px",
              color: "#64748b",
            }}
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
