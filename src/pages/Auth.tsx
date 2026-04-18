import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { useAuth } from "../contexts/AuthContext";
import { APP_BG, APP_BORDER, APP_CARD, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { SplashScreen } from "../components/SplashScreen";
import { IconEye, IconEyeOff } from "../components/ui/Icon";

function authErrorToUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_grant")) {
    return "Email ou mot de passe incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Vérifie ta boîte mail pour confirmer ton compte.";
  }
  if (m.includes("user already registered")) {
    return "Ce compte existe déjà. Connecte-toi.";
  }
  return "Connexion impossible. Réessaie dans un instant.";
}

function oauthRedirectUrl(): string {
  return `${window.location.origin}/#/auth`;
}

export default function Auth() {
  const { user, isProfileComplete, isLoading } = useAuth();
  const [introSplash, setIntroSplash] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const t = window.setTimeout(() => setIntroSplash(false), 1000);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  if (isLoading || introSplash) {
    return <SplashScreen />;
  }

  if (user) {
    if (isProfileComplete) {
      return <Navigate to="/discover" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  async function signInWithProvider(provider: "google" | "apple") {
    setMessage(null);
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: oauthRedirectUrl() },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setMessage({ type: "error", text: authErrorToUserMessage(err) });
    } finally {
      setOauthLoading(null);
    }
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
        setMessage({ type: "success", text: "Compte créé. Vérifie ton email pour confirmer." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: authErrorToUserMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }

  const btnPrimary: React.CSSProperties = {
    width: "100%",
    padding: "16px 18px",
    borderRadius: "16px",
    border: "none",
    background: BRAND_BG,
    color: TEXT_ON_BRAND,
    fontWeight: 700,
    fontSize: "16px",
    cursor: loading || oauthLoading ? "wait" : "pointer",
    opacity: loading || oauthLoading ? 0.75 : 1,
  };

  const btnOAuth: React.CSSProperties = {
    ...btnPrimary,
    background: APP_CARD,
    color: "rgba(255,255,255,0.95)",
    border: `1px solid ${APP_BORDER}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: APP_BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "24px 18px 32px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <img
            src="/logo.png"
            alt=""
            style={{ width: 72, height: "auto", marginBottom: 20, opacity: 0.95 }}
          />
          <h1
            style={{
              margin: "0 0 12px 0",
              fontSize: "28px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.98)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            Swipe ailleurs.
            <br />
            Rencontre ici.
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.58)",
              lineHeight: 1.45,
            }}
          >
            Un match. Une activité. Une vraie rencontre.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            type="button"
            style={btnOAuth}
            disabled={!!oauthLoading || loading}
            onClick={() => void signInWithProvider("apple")}
          >
            {oauthLoading === "apple" ? "Connexion…" : "Continuer avec Apple"}
          </button>
          <button
            type="button"
            style={btnOAuth}
            disabled={!!oauthLoading || loading}
            onClick={() => void signInWithProvider("google")}
          >
            {oauthLoading === "google" ? "Connexion…" : "Continuer avec Google"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowEmailForm((v) => !v);
              setMessage(null);
            }}
            style={{
              marginTop: 4,
              padding: "12px",
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showEmailForm ? "Masquer email" : "Continuer avec email"}
          </button>

          {showEmailForm ? (
            <form
              onSubmit={handleSubmit}
              style={{
                marginTop: 8,
                padding: "20px 18px",
                borderRadius: "20px",
                border: `1px solid ${APP_BORDER}`,
                background: APP_CARD,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
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
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  background: APP_BG,
                  color: "rgba(255, 255, 255, 0.95)",
                  fontSize: "16px",
                  outline: "none",
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
                    padding: "14px 44px 14px 16px",
                    borderRadius: "14px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: APP_BG,
                    color: "rgba(255, 255, 255, 0.95)",
                    fontSize: "16px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(255, 255, 255, 0.45)",
                    padding: 6,
                  }}
                >
                  {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                </button>
              </div>
              {!isSignUp && (
                <div style={{ textAlign: "right", marginTop: -6 }}>
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
              <button type="submit" disabled={loading} style={btnPrimary}>
                {loading ? "Chargement…" : isSignUp ? "Créer mon compte" : "Se connecter"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp((v) => !v);
                  setMessage(null);
                }}
                style={{
                  padding: 8,
                  border: "none",
                  background: "transparent",
                  color: BRAND_BG,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {isSignUp ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S’inscrire"}
              </button>
            </form>
          ) : null}
        </div>

        <p
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.42)",
            padding: "0 8px",
          }}
        >
          En continuant, tu acceptes nos CGU et notre Politique de confidentialité.
        </p>
      </div>
    </div>
  );
}
