import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { useAuth } from "../contexts/AuthContext";
import { APP_BG, APP_BORDER, APP_CARD, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconEye, IconEyeOff } from "../components/ui/Icon";

export default function Auth() {
  const { user, isProfileComplete, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: APP_BG }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "rgba(255, 255, 255, 0.72)", fontSize: "15px" }}>Chargement…</span>
        </div>
      </div>
    );
  }

  if (user) {
    if (isProfileComplete) {
      return <Navigate to="/discover" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      if (isSignUp) {
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const authUserId = signUpData.user?.id;
        if (authUserId) {
          await ensureProfileRowForAuthUserId(authUserId);
        }
        setMessage({ type: "success", text: "Compte créé. Vérifiez votre email pour confirmer." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // La redirection se fait via `if (user)` une fois le profil chargé (complet → Discover, sinon onboarding).
      }
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
        background: APP_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: APP_CARD,
          borderRadius: "24px",
          padding: "28px 24px 24px 24px",
          border: `1px solid ${APP_BORDER}`,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
          }}
        >
          <img
            src="/logo.png"
            alt="Splove logo"
            className="object-contain"
            style={{
              width: "100%",
              maxWidth: "200px",
              height: "auto",
              marginBottom: "28px",
            }}
          />
          <h1
            style={{
              margin: "0 0 8px 0",
              fontSize: "36px",
              fontWeight: 700,
              color: "rgba(255, 255, 255, 0.96)",
              textAlign: "center",
              letterSpacing: "-0.02em",
            }}
          >
            SPLove
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(255, 255, 255, 0.62)", textAlign: "center", lineHeight: 1.5 }}>
            Des rencontres réelles autour du sport.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="placeholder:text-[rgba(255,255,255,0.38)]"
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              background: APP_BG,
              color: "rgba(255, 255, 255, 0.95)",
              fontSize: "16px",
              outline: "none",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 30, 45, 0.65)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 30, 45, 0.22)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.14)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="placeholder:text-[rgba(255,255,255,0.38)]"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 40px 14px 16px",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background: APP_BG,
                color: "rgba(255, 255, 255, 0.95)",
                fontSize: "16px",
                outline: "none",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 30, 45, 0.65)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 30, 45, 0.22)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.14)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255, 255, 255, 0.52)",
                padding: "6px",
                lineHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.88)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.52)";
                e.currentTarget.style.background = "transparent";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid rgba(255, 30, 45, 0.35)";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.outlineOffset = "0";
              }}
            >
              {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
            </button>
          </div>
          {!isSignUp && (
            <div style={{ textAlign: "right", marginTop: "-8px" }}>
              <Link
                to="/forgot-password"
                style={{ fontSize: "13px", color: BRAND_BG, fontWeight: 600, textDecoration: "none" }}
              >
                Mot de passe oublié ?
              </Link>
            </div>
          )}
          {message && (
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: message.type === "error" ? "#fca5a5" : "#6ee7b7",
                lineHeight: 1.45,
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
            {loading ? "Chargement…" : isSignUp ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setIsSignUp((v) => !v); setMessage(null); }}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "10px",
            border: "none",
            background: "transparent",
            color: BRAND_BG,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isSignUp ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire"}
        </button>
      </div>
    </div>
  );
}
