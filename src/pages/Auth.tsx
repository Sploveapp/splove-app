import { useEffect, useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { oauthRedirectUrl } from "../lib/authRedirect";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { useAuth } from "../contexts/AuthContext";
import { APP_BG, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { SplashScreen } from "../components/SplashScreen";
import { PostLoginProfileSplash } from "../components/PostLoginProfileSplash";
import { IconEye, IconEyeOff } from "../components/ui/Icon";
import { useTranslation } from "../i18n/useTranslation";
import { stashPendingReferralCodeFromSearch } from "../services/referral.service";
import { clearOnboardingUiLocalCache } from "../lib/onboardingUiLocalCache";

function signupModeFromSearchParams(sp: URLSearchParams): boolean {
  return sp.get("signup") === "1" || sp.get("mode") === "signup";
}

/** Welcome « Continuer avec email » : formulaire direct sans palier Apple/Google/Email. */
function emailFormDirectFromSearchParams(sp: URLSearchParams): boolean {
  return sp.get("email") === "1";
}

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
  const { t, language, setLanguage } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, isProfileComplete, isLoading, isAuthInitialized, isProfileLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(() => signupModeFromSearchParams(searchParams));
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
    if (signupModeFromSearchParams(searchParams)) {
      setIsSignUp(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthInitialized || isLoading) return;
    if (import.meta.env.DEV) {
      const pr = profile as Record<string, unknown> | null | undefined;
      console.info("[AuthRouteGuard] post_auth_state", {
        current_route: "/auth",
        auth_user_id: user?.id ?? null,
        isProfileComplete,
        profile_completed: pr?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
      });
    }
  }, [isAuthInitialized, isLoading, user?.id, isProfileComplete, profile]);

  useEffect(() => {
    if (!user?.id || !isProfileComplete || isProfileLoading) return;
    clearOnboardingUiLocalCache();
  }, [user?.id, isProfileComplete, isProfileLoading]);

  const emailDirect = emailFormDirectFromSearchParams(searchParams);
  const showEmailFormBlock = showEmailForm || emailDirect;

  if (!isAuthInitialized || isLoading) {
    return <SplashScreen />;
  }

  if (user && isProfileLoading) {
    return <PostLoginProfileSplash />;
  }

  if (user) {
    const pr = profile as Record<string, unknown> | null | undefined;
    if (isProfileComplete) {
      console.log("[ONBOARDING_GUARD] auth redirect -> /discover", {
        userId: user.id,
        profile_completed: pr?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
      });
      return <Navigate to="/discover" replace />;
    }
    console.log("[ONBOARDING_GUARD] auth redirect -> /onboarding", {
      userId: user.id,
      profile_completed: pr?.profile_completed ?? null,
      onboarding_completed: pr?.onboarding_completed ?? null,
      onboarding_done: pr?.onboarding_done ?? null,
      isProfileComplete,
    });
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
    borderRadius: "20px",
    border: "none",
    background: BRAND_BG,
    color: TEXT_ON_BRAND,
    fontWeight: 700,
    fontSize: "16px",
    cursor: loading || oauthLoading ? "wait" : "pointer",
    opacity: loading || oauthLoading ? 0.75 : 1,
    boxShadow: "0 10px 30px rgba(0,0,0,0.32)",
  };

  const btnOAuth: React.CSSProperties = {
    ...btnPrimary,
    background: "rgba(20, 20, 24, 0.55)",
    color: "rgba(255,255,255,0.95)",
    border: "1px solid rgba(255,255,255,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.32)",
  };

  const langPillBtn = (lang: "fr" | "en"): React.CSSProperties => ({
    padding: "5px 10px",
    borderRadius: "999px",
    border: "none",
    background: language === lang ? BRAND_BG : "transparent",
    color: language === lang ? TEXT_ON_BRAND : "rgba(255,255,255,0.55)",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "background-color 150ms ease, color 150ms ease",
  });

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#000",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "20px 18px 36px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes spvAuthFadeUp {
          from { opacity: 0; transform: translate3d(0, 10px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .spv-auth-fade-in {
          opacity: 0;
          animation: spvAuthFadeUp 380ms ease-out forwards;
          will-change: opacity, transform;
        }
        .spv-auth-tactile {
          transition: transform 140ms ease, box-shadow 200ms ease, opacity 200ms ease;
        }
        .spv-auth-tactile:active {
          transform: scale(0.985);
        }
        @media (prefers-reduced-motion: reduce) {
          .spv-auth-fade-in { animation: none !important; opacity: 1 !important; transform: none !important; }
          .spv-auth-tactile { transition: none !important; }
        }
      `}</style>

      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <source src="/videos/splove-hero.mp4" type="video/mp4" />
      </video>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.78))",
        }}
      />

      <div
        role="group"
        aria-label="Language"
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top, 0px), 14px)",
          right: 14,
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          padding: "3px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.06)",
          border: `1px solid rgba(255,255,255,0.12)`,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 10,
        }}
      >
        <button
          type="button"
          aria-label="Français"
          aria-pressed={language === "fr"}
          onClick={() => setLanguage("fr")}
          style={langPillBtn("fr")}
        >
          FR
        </button>
        <span aria-hidden style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>
          |
        </span>
        <button
          type="button"
          aria-label="English"
          aria-pressed={language === "en"}
          onClick={() => setLanguage("en")}
          style={langPillBtn("en")}
        >
          EN
        </button>
      </div>
      <div
        className="spv-auth-fade-in"
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "420px",
          margin: "0 auto",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <img
            src="/logo.png"
            alt=""
            style={{ width: 78, height: "auto", marginBottom: 18, opacity: 0.96 }}
          />
          <h1
            style={{
              margin: "0 0 10px 0",
              fontSize: "28px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.98)",
              lineHeight: 1.18,
              letterSpacing: "-0.02em",
              textShadow: "0 1px 14px rgba(0,0,0,0.45)",
            }}
          >
            {t("auth_hero_main_slogan")}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.45,
              textShadow: "0 1px 10px rgba(0,0,0,0.45)",
            }}
          >
            {t("auth_hero_subtitle")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!emailDirect ? (
            <>
              <button
                type="button"
                className="opacity-60 cursor-pointer spv-auth-tactile"
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
                className="spv-auth-tactile"
                style={btnOAuth}
                disabled={!!oauthLoading || loading}
                onClick={() => void signInWithGoogle()}
              >
                {oauthLoading === "google" ? `${t("loading")}` : t("continue_with_google")}
              </button>

              <button
                type="button"
                className="spv-auth-tactile"
                onClick={() => {
                  setShowEmailForm((v) => !v);
                  setMessage(null);
                }}
                style={{
                  ...btnOAuth,
                  marginTop: 2,
                  background: "rgba(20, 20, 24, 0.45)",
                  color: "rgba(255,255,255,0.85)",
                  fontWeight: 600,
                }}
              >
                {showEmailForm ? t("hide_email") : t("continue_with_email")}
              </button>
            </>
          ) : null}

          {showEmailFormBlock ? (
            <form
              onSubmit={handleSubmit}
              style={{
                marginTop: 8,
                padding: "20px 18px",
                borderRadius: "22px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(18, 18, 22, 0.62)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
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
              <button type="submit" disabled={loading} className="spv-auth-tactile" style={btnPrimary}>
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

          {emailDirect ? (
            <button
              type="button"
              className="spv-auth-tactile self-center"
              onClick={() => {
                navigate("/auth", { replace: true });
                setShowEmailForm(false);
                setMessage(null);
              }}
              style={{
                marginTop: 4,
                padding: "10px 14px",
                border: "none",
                background: "transparent",
                color: BRAND_BG,
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {t("auth_email_other_options")}
            </button>
          ) : null}
        </div>

        <p
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.62)",
            padding: "0 8px",
            textShadow: "0 1px 8px rgba(0,0,0,0.45)",
          }}
        >
          {t("auth_terms_notice")}
        </p>
      </div>
    </div>
  );
}
