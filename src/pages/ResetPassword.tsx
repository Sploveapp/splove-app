import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GlobalHeader } from "../components/GlobalHeader";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage({ type: "error", text: "Les mots de passe ne correspondent pas." });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: "error", text: "Le mot de passe doit contenir au moins 6 caractères." });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: "success", text: "Mot de passe mis à jour. Redirection…" });
      setTimeout(() => {
        navigate("/discover", { replace: true });
      }, 800);
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
            Nouveau mot de passe
          </h1>
          <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
            Choisissez un mot de passe sécurisé pour votre compte.
          </p>

          {sessionReady === false && (
            <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#dc2626", lineHeight: 1.4 }}>
              Lien invalide ou expiré. Demandez un nouveau lien depuis la page mot de passe oublié.
            </p>
          )}

          {sessionReady !== false && (
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input
                type="password"
                placeholder="Nouveau mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #2A2A2E",
                  fontSize: "16px",
                  outline: "none",
                }}
              />
              <input
                type="password"
                placeholder="Confirmer le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
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
                  }}
                >
                  {message.text}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || sessionReady === null}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: BRAND_BG,
                  color: TEXT_ON_BRAND,
                  fontWeight: 600,
                  fontSize: "16px",
                  cursor: loading || sessionReady === null ? "not-allowed" : "pointer",
                  opacity: loading || sessionReady === null ? 0.8 : 1,
                }}
              >
                {loading ? "Chargement…" : "Enregistrer"}
              </button>
            </form>
          )}

          <Link
            to="/forgot-password"
            style={{
              display: "block",
              marginTop: "20px",
              textAlign: "center",
              fontSize: "14px",
              color: "#64748b",
            }}
          >
            Demander un nouveau lien
          </Link>
          <Link
            to="/auth"
            style={{
              display: "block",
              marginTop: "8px",
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
