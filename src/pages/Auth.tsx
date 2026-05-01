import { useEffect, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { oauthRedirectUrl } from "../lib/authRedirect";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { useAuth } from "../contexts/AuthContext";
import { APP_BG, APP_BORDER, APP_CARD, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { SplashScreen } from "../components/SplashScreen";
import { IconEye, IconEyeOff } from "../components/ui/Icon";
import { useTranslation } from "../i18n/useTranslation";
import { stashPendingReferralCodeFromSearch } from "../services/referral.service";

function authErrorToUserMessage(err: unknown, language: "fr" | "en"): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_grant")) {
    return language === "en" ? "Incorrect email or password." : "Email ou mot de passe incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return language === "en"
      ? "Check your inbox to confirm your account."
      : "Verifie ta boite mail pour confirmer ton compte.";
  }
  if (m.includes("user already registered")) {
    return language === "en" ? "This account already exists. Log in." : "Ce compte existe deja. Connecte-toi.";
  }
  return language === "en"
    ? "Unable to sign in right now. Please try again."
    : "Connexion impossible. Reessaie dans un instant.";
}

export default function Auth() {
  const { t, language } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user, isProfileComplete, isLoading, isAuthInitialized } = useAuth();
  const [introSplash, setIntroSplash] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [appleNotice, setAppleNotice] = useState(false);

  useEffect(() => {
    stashPendingReferralCodeFromSearch(searchParams.get("ref"));
    if (typeof window !== "undefined") {
      stashPendingReferralCodeFromSearch(new URLSearchParams(window.location.search).get("ref"));
    }
  }, [searchParams]);

  useEffect(() => {
    if (isLoading || !isAuthInitialized) return;
    const t = window.setTimeout(() => setIntroSplash(false), 1000);
    return () => window.clearTimeout(t);
  }, [isLoading, isAuthInitialized]);

  useEffect(() => {
    if (!isAuthInitialized || isLoading) return;
    // TEMP DEBUG: final redirect decision inputs on /auth.
    console.debug("[Auth page] post-auth state", {
      hasUser: Boolean(user?.id),
      userId: user?.id ? user.id.slice(0, 8) + "…" : null,
      isProfileComplete,
      introSplash,
    });
  }, [isAuthInitialized, isLoading, user?.id, isProfileComplete, introSplash]);

  if (!isAuthInitialized || isLoading || introSplash) {
    return <SplashScreen />;
  }

  if (user) {
    if (isProfileComplete) {
      return <Navigate to="/discover" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  async function signInWithGoogle() {
    setMessage(null);
    setOauthLoading("google");
    try {
      console.log("[GoogleOAuth] click");
      console.log("[GoogleOAuth] redirectTo", oauthRedirectUrl());
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectUrl() },
      });
      if (error) throw error;
      console.log("[GoogleOAuth] redirect started");
    } catch (err: unknown) {
      setMessage({ type: "error", text: authErrorToUserMessage(err, language) });
    } finally {
      setOauthLoading(null);
    }
  }

  const handleAppleComingSoon = () => {
    console.log("[AppleOAuth] coming soon clicked", {
      source: "auth_screen",
      timestamp: new Date().toISOString(),
    });

    setAppleNotice(true);

    window.setTimeout(() => {
      setAppleNotice(false);
    }, 3500);
  };

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
        setMessage({ type: "success", text: t("auth_signup_success") });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: authErrorToUserMessage(err, language),
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
            {t("auth_hero_title_line_1")}
            <br />
            {t("auth_hero_title_line_2")}
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
            {t("auth_hero_subtitle")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            type="button"
            className="opacity-60 cursor-pointer"
            style={{
              ...btnOAuth,
              opacity: loading || oauthLoading ? 0.5 : 0.6,
            }}
            disabled={!!oauthLoading || loading}
            onClick={handleAppleComingSoon}
          >
            {t("continue_with_apple")}
          </button>
          {appleNotice && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white shadow-lg backdrop-blur"
            >
              {t("auth_apple_coming_soon_line_1")}
              <br />
              <span className="text-white/70">{t("auth_apple_coming_soon_line_2")}</span>
            </div>
          )}
          <button
            type="button"
            style={btnOAuth}
            disabled={!!oauthLoading || loading}
            onClick={() => void signInWithGoogle()}
          >
            {oauthLoading === "google" ? `${t("loading")}` : t("continue_with_google")}
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
            {showEmailForm ? t("hide_email") : t("continue_with_email")}
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
                placeholder={t("email")}
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
                  placeholder={t("password")}
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
                  aria-label={showPassword ? t("hide_password") : t("show_password")}
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
                    {t("forgot_password")}
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
                {loading ? t("loading") : isSignUp ? t("create_account") : t("login")}
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
                {isSignUp ? t("auth_toggle_signin") : t("auth_toggle_signup")}
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
          {t("auth_terms_notice")}
        </p>
      </div>
    </div>
  );
}
