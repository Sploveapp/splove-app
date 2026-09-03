import { useEffect, useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { signInWithGoogleOAuth, signInWithAppleOAuth, subscribeGoogleOAuthBrowserTimeout, SPLOVE_OAUTH_BROWSER_CLOSED_EVENT } from "../lib/capacitorOAuth";
import { consumeAuthOAuthUserMessage } from "../lib/authOAuthUserMessage";
import { GOOGLE_OAUTH_USER_ERROR_MSG, APPLE_OAUTH_USER_ERROR_MSG } from "../lib/googleOAuthFlow";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { showGoogleSignInOverlay, hideGoogleSignInOverlay, awaitGoogleSignInOverlayPaint } from "../lib/googleSignInOverlay";
import { isIosGoogleOAuthBrowserFlow, showIosGoogleOAuthConnectingOverlay, hideIosGoogleOAuthConnectingOverlay } from "../lib/iosGoogleOAuthDisplay";
import {
  isAndroidGoogleNativeEnabled,
  signInWithGoogleNativeAndroid,
} from "../lib/googleNativeSignIn";
import { isNativeCapacitorApp } from "../lib/authRedirect";
import { beginWebOAuthSplash } from "../lib/webOAuthSplash";
import { logOAuthLoaderDiag } from "../lib/oauthLoaderDiag";
import { useAuth } from "../contexts/AuthContext";
import { APP_BG, APP_TEXT_MUTED, BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import { IconEye, IconEyeOff } from "../components/ui/Icon";
import { useTranslation } from "../i18n/useTranslation";
import { stashPendingReferralCodeFromSearch } from "../services/referral.service";
import { clearOnboardingUiLocalCache } from "../lib/onboardingUiLocalCache";
import { resolveBootRoute } from "../lib/bootRouteDecision";
import { isPasswordRecoveryFlowActive } from "../lib/passwordRecoveryDeepLink";
import { SplashScreen } from "../components/SplashScreen";
function signupModeFromSearchParams(sp: URLSearchParams): boolean {
  return sp.get("signup") === "1" || sp.get("mode") === "signup";
}

/** Welcome « Continuer avec email » : formulaire direct sans palier Apple/Google/Email. */
function emailFormDirectFromSearchParams(sp: URLSearchParams): boolean {
  return sp.get("email") === "1";
}

/** Fond sportif — asset public (compatible Capacitor iOS). */
const AUTH_SPORT_BG_IMAGE = `${import.meta.env.BASE_URL}welcome-sport-clean.png?v=2`.replace(/\/{2,}/g, "/");

function AuthSportShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        backgroundColor: "#050509",
        backgroundImage: `url(${AUTH_SPORT_BG_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "center 38%",
        backgroundRepeat: "no-repeat",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "20px 18px 36px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.65), rgba(0,0,0,0.82))",
        }}
      />
      <div style={{ position: "relative", zIndex: 2, width: "100%" }}>{children}</div>
    </div>
  );
}

function AuthBrandMark({
  slogan,
  subtitle,
}: {
  slogan: string;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -24,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255, 30, 45, 0.42) 0%, rgba(255, 30, 45, 0.08) 48%, transparent 72%)",
            filter: "blur(10px)",
            pointerEvents: "none",
          }}
        />
        <img
          src="/logo.png"
          alt="SPLove"
          width={96}
          height={96}
          fetchPriority="high"
          decoding="sync"
          draggable={false}
          style={{
            position: "relative",
            width: 96,
            height: 96,
            objectFit: "contain",
            filter: "drop-shadow(0 8px 28px rgba(255, 30, 45, 0.35))",
          }}
        />
      </div>
      <h1
        style={{
          margin: "0 0 10px 0",
          fontSize: "30px",
          fontWeight: 800,
          color: "rgba(255,255,255,0.98)",
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          textShadow: "0 1px 14px rgba(0,0,0,0.45)",
        }}
      >
        {slogan}
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 500,
          color: "rgba(255,255,255,0.78)",
          lineHeight: 1.45,
          maxWidth: 320,
          marginLeft: "auto",
          marginRight: "auto",
          textShadow: "0 1px 10px rgba(0,0,0,0.45)",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
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
  if (raw.includes(GOOGLE_OAUTH_USER_ERROR_MSG)) {
    return GOOGLE_OAUTH_USER_ERROR_MSG;
  }
  return language === "en"
    ? "Unable to sign in right now. Please try again."
    : "Connexion impossible. Reessaie dans un instant.";
}

export default function Auth() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, profile, isProfileComplete, isLoading, isAuthInitialized, isProfileLoading, profileBootstrapSettled } =
    useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(() => signupModeFromSearchParams(searchParams));
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    stashPendingReferralCodeFromSearch(searchParams.get("ref"));
    if (typeof window !== "undefined") {
      stashPendingReferralCodeFromSearch(new URLSearchParams(window.location.search).get("ref"));
    }
  }, [searchParams]);

  useEffect(() => {
    const pending = consumeAuthOAuthUserMessage();
    if (pending) {
      setMessage({ type: "error", text: pending });
    }
  }, []);

  useEffect(() => {
    return subscribeGoogleOAuthBrowserTimeout(() => {
      hideGoogleSignInOverlay("browser_timeout");
      setMessage({ type: "error", text: GOOGLE_OAUTH_USER_ERROR_MSG });
      setOauthLoading(null);
    });
  }, []);

  useEffect(() => {
    const onBrowserClosed = () => setOauthLoading(null);
    window.addEventListener(SPLOVE_OAUTH_BROWSER_CLOSED_EVENT, onBrowserClosed);
    return () => window.removeEventListener(SPLOVE_OAUTH_BROWSER_CLOSED_EVENT, onBrowserClosed);
  }, []);

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
  const authBootstrapping = !isAuthInitialized || isLoading;

  if (isPasswordRecoveryFlowActive()) {
    return <Navigate to="/reset-password" replace />;
  }

  if (user) {
    if (isPasswordRecoveryFlowActive()) {
      return <Navigate to="/reset-password" replace />;
    }
    const pr = profile as Record<string, unknown> | null | undefined;
    const bootDecision = resolveBootRoute({
      isAuthInitialized,
      isLoading,
      isProfileLoading,
      profileBootstrapSettled,
      session,
      profile,
      isProfileComplete,
    });
    if (bootDecision.status === "loading") {
      logOAuthLoaderDiag("AuthRedirect/Auth", "splash (boot loading)", {
        authLoading: isLoading,
        profileLoading: isProfileLoading,
        isAuthInitialized,
        decisionReason: bootDecision.reason,
      });
      return <SplashScreen overlay />;
    }
    if (bootDecision.status === "ready" && bootDecision.route === "/move") {
      console.log("AUTH_REDIRECT_MOVE", {
        userId: user.id,
        profile_completed: pr?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
      });
      logOAuthLoaderDiag("AuthRedirect/Auth", "navigate /move (profile complete)", {
        authLoading: isLoading,
        profileLoading: isProfileLoading,
        isAuthInitialized,
        isProfileComplete,
        onboardingCompleted: pr?.onboarding_completed ?? null,
      });
      return <Navigate to="/move" replace />;
    }
    if (bootDecision.status === "ready" && bootDecision.route === "/onboarding") {
      console.log("AUTH_REDIRECT_ONBOARDING", {
        userId: user.id,
        profile_completed: pr?.profile_completed ?? null,
        onboarding_completed: pr?.onboarding_completed ?? null,
        onboarding_done: pr?.onboarding_done ?? null,
        isProfileComplete,
      });
      logOAuthLoaderDiag("AuthRedirect/Auth", "navigate /onboarding", {
        authLoading: isLoading,
        profileLoading: isProfileLoading,
        isAuthInitialized,
        isProfileComplete,
        onboardingCompleted: pr?.onboarding_completed ?? null,
      });
      return <Navigate to="/onboarding" replace />;
    }
    logOAuthLoaderDiag("AuthRedirect/Auth", "splash (boot unresolved)", {
      authLoading: isLoading,
      profileLoading: isProfileLoading,
      isAuthInitialized,
      isProfileComplete,
      decisionReason: bootDecision.reason,
      onboardingCompleted: pr?.onboarding_completed ?? null,
    });
    return <SplashScreen overlay />;
  }

  logOAuthLoaderDiag("AuthRedirect/Auth", "render auth form (no redirect)", {
    authLoading: isLoading,
    profileLoading: isProfileLoading,
    isAuthInitialized,
    authBootstrapping,
    oauthLoading,
  });

  async function signInWithGoogle() {
    console.log("GOOGLE_SIGNIN_BUTTON_TAP", {
      via: "Auth",
      androidNative: isAndroidGoogleNativeEnabled(),
    });
    setMessage(null);
    setOauthLoading("google");
    if (isAndroidGoogleNativeEnabled()) {
      console.log("GOOGLE_NATIVE_START", { via: "Auth" });
      try {
        const { error } = await signInWithGoogleNativeAndroid();
        if (error) {
          setMessage({ type: "error", text: error.message || GOOGLE_OAUTH_USER_ERROR_MSG });
          setOauthLoading(null);
        }
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : GOOGLE_OAUTH_USER_ERROR_MSG;
        setMessage({ type: "error", text });
        setOauthLoading(null);
      }
      return;
    }
    if (isIosGoogleOAuthBrowserFlow()) {
      await showIosGoogleOAuthConnectingOverlay();
    } else if (!isNativeCapacitorApp()) {
      beginWebOAuthSplash();
      showGoogleSignInOverlay();
      await awaitGoogleSignInOverlayPaint();
    }
    try {
      const { error } = await signInWithGoogleOAuth();
      if (error) {
        hideGoogleSignInOverlay("sign_in_error");
        setMessage({ type: "error", text: error.message || GOOGLE_OAUTH_USER_ERROR_MSG });
        setOauthLoading(null);
      }
    } catch (err: unknown) {
      hideGoogleSignInOverlay("sign_in_exception");
      setMessage({ type: "error", text: GOOGLE_OAUTH_USER_ERROR_MSG });
      setOauthLoading(null);
    }
  }

  async function signInWithApple() {
    if (oauthLoading) return;
    setMessage(null);
    setOauthLoading("apple");
    if (isIosGoogleOAuthBrowserFlow()) {
      await showIosGoogleOAuthConnectingOverlay();
    } else if (!isNativeCapacitorApp()) {
      beginWebOAuthSplash();
      showGoogleSignInOverlay();
      await awaitGoogleSignInOverlayPaint();
    } else {
      showGoogleSignInOverlay();
      await awaitGoogleSignInOverlayPaint();
    }
    try {
      const { error } = await signInWithAppleOAuth();
      if (error) {
        hideGoogleSignInOverlay("apple_sign_in_error");
        hideIosGoogleOAuthConnectingOverlay("apple_sign_in_error");
        setMessage({ type: "error", text: error.message || APPLE_OAUTH_USER_ERROR_MSG });
        setOauthLoading(null);
      }
    } catch {
      hideGoogleSignInOverlay("apple_sign_in_exception");
      hideIosGoogleOAuthConnectingOverlay("apple_sign_in_exception");
      setMessage({ type: "error", text: APPLE_OAUTH_USER_ERROR_MSG });
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

  return (
    <AuthSportShell>
      <style>{`
        .spv-auth-tactile {
          transition: transform 140ms ease, box-shadow 200ms ease, opacity 200ms ease;
        }
        .spv-auth-tactile:active {
          transform: scale(0.985);
        }
        @keyframes spvAuthCtaIn {
          from { opacity: 0; transform: translate3d(0, 8px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .spv-auth-cta-in {
          animation: spvAuthCtaIn 280ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .spv-auth-cta-in { animation: none !important; opacity: 1 !important; transform: none !important; }
          .spv-auth-tactile { transition: none !important; }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "420px",
          margin: "0 auto",
        }}
      >
        <AuthBrandMark slogan={t("auth_hero_main_slogan")} subtitle={t("auth_hero_subtitle")} />

        <div
          className={authBootstrapping ? undefined : "spv-auth-cta-in"}
          aria-busy={authBootstrapping}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            opacity: authBootstrapping ? 0.42 : 1,
            pointerEvents: authBootstrapping ? "none" : "auto",
            transition: "opacity 200ms ease",
          }}
        >
          {!emailDirect ? (
            <>
              <button
                type="button"
                className="spv-auth-tactile"
                style={btnOAuth}
                disabled={authBootstrapping || !!oauthLoading || loading}
                onClick={() => void signInWithApple()}
              >
                {oauthLoading === "apple" ? `${t("loading")}` : t("continue_with_apple")}
              </button>
              <button
                type="button"
                className="spv-auth-tactile"
                style={btnOAuth}
                disabled={authBootstrapping || !!oauthLoading || loading}
                onClick={() => void signInWithGoogle()}
              >
                {oauthLoading === "google" ? `${t("loading")}` : t("continue_with_google")}
              </button>

              <button
                type="button"
                className="spv-auth-tactile"
                disabled={authBootstrapping}
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
              <div>
                <label
                  htmlFor="auth-password"
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.72)",
                  }}
                >
                  {t("password")}
                </label>
                <div style={{ position: "relative" }}>
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  name="password"
                  aria-label={t("password")}
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
            color: APP_TEXT_MUTED,
            padding: "0 8px",
            position: "relative",
            zIndex: 3,
            maxWidth: "100%",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            whiteSpace: "normal",
          }}
        >
          {t("welcome_legal_part1")}
          <Link
            to="/cgu"
            style={{
              color: BRAND_BG,
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            {t("welcome_legal_link_terms")}
          </Link>
          {t("welcome_legal_part2")}
          <Link
            to="/privacy"
            style={{
              color: BRAND_BG,
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            {t("welcome_legal_link_privacy")}
          </Link>
          {t("welcome_legal_part3")}
        </p>
      </div>
    </AuthSportShell>
  );
}
