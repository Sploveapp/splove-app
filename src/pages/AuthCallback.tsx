import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  clearOAuthCallbackUrl,
  closeCapacitorOAuthBrowser,
  peekOAuthCallbackUrl,
  releaseGoogleOAuthFlowLock,
} from "../lib/capacitorOAuth";
import { stashAuthOAuthUserMessage } from "../lib/authOAuthUserMessage";
import { GOOGLE_OAUTH_USER_ERROR_MSG } from "../lib/googleOAuthFlow";
import { resolveOAuthCallbackParams } from "../lib/oauthCallbackParams";
import { formatExchangeCodeLog, redactOAuthUrl, redactUserId } from "../lib/oauthLogSanitize";
import {
  clearAllOAuthSessionLocks,
  clearOauthProcessingLock,
  setOauthProcessingLock,
} from "../lib/oauthCallbackLock";
import {
  isNativeCapacitorApp,
  replaceWithHashRoute,
  scrubOAuthTokensFromBrowserUrl,
} from "../lib/authRedirect";
import { setOAuthSessionWithTimeout } from "../lib/supabaseSetSession";
import { logOAuthRedirect, markOAuthSessionAt } from "../lib/postLoginPerf";
import { dismissPostOAuthSplash } from "../lib/postOAuthSplash";
import { resolvePostOAuthPath } from "../lib/profileSelect";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { hideCapacitorSplashWhenReady } from "../lib/capacitorNativeSplash";
import { OAuthConnectingSplash } from "../components/OAuthConnectingSplash";
import { completeNativeOAuthReturn, isNativeOAuthReturnInFlight } from "../lib/completeNativeOAuthReturn";
import { scrubOAuthTokensFromNativeWindow } from "../lib/scrubOAuthUrlFromWindow";
import {
  logOAuthRedirectDestination,
  logOAuthSuccess,
  verifyDefinitiveSupabaseSession,
} from "../lib/oauthSessionRecoveryDiag";

const GOOGLE_SET_SESSION_MS = 8000;
const isDev = import.meta.env.DEV;

const ERR_NO_SESSION_USER = "Connexion impossible. Session OAuth non créée.";

type CallbackDebug = {
  currentUrl: string;
  hasAccessToken: boolean;
  exchangeResult: string;
  userId: string | null;
  finalError: string;
};

const emptyDebug = (): CallbackDebug => ({
  currentUrl: "",
  hasAccessToken: false,
  exchangeResult: "—",
  userId: null,
  finalError: "—",
});

function decodeOAuthToken(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeStringify(x: unknown, max = 2000): string {
  try {
    const s = JSON.stringify(
      x,
      (key, v) => {
        if (typeof v === "bigint") return String(v);
        if (/token|secret|password|authorization/i.test(key)) return "[redacted]";
        return v;
      },
      2,
    );
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch (e) {
    return String(e);
  }
}

function DevDebugPanel({ debug }: { debug: CallbackDebug }) {
  if (!isDev) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: "36vh",
        overflow: "auto",
        zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        borderTop: "1px solid rgba(255,255,255,0.2)",
        padding: "10px 12px",
        fontSize: 11,
        fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeStringify(debug, 4000)}</pre>
    </div>
  );
}


/** Garde-fou iOS : ne jamais traiter #/auth/callback dans le WebView (flux natif dédié). */
function NativeOAuthCallbackGuard() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (isNativeOAuthReturnInFlight()) {
      console.log("NATIVE_OAUTH_CALLBACK_GUARD_SKIP", "in_flight");
      return;
    }
    scrubOAuthTokensFromNativeWindow("#/auth");
    const stashed = peekOAuthCallbackUrl();
    if (stashed) {
      void completeNativeOAuthReturn(stashed);
      return;
    }
    window.location.hash = "#/auth";
  }, []);

  return <OAuthConnectingSplash />;
}

export default function AuthCallback() {
  const nativeCapacitor = isNativeCapacitorApp();
  if (nativeCapacitor) {
    return <NativeOAuthCallbackGuard />;
  }

  setOauthProcessingLock();
  const oauthLockLoggedRef = useRef(false);
  if (!oauthLockLoggedRef.current) {
    oauthLockLoggedRef.current = true;
    console.log("[AuthCallback] oauth lock ON");
  }

  const location = useLocation();
  const { syncAuthSession } = useAuth();

  const clearOauthCallbackStorage = () => {
    clearOAuthCallbackUrl();
    scrubOAuthTokensFromBrowserUrl();
  };

  const navigateAfterOAuth = (path: "/move" | "/onboarding" | "/") => {
    const target = path === "/move" ? "/move" : path === "/onboarding" ? "/onboarding" : "/";
    if (target === "/move") {
      console.log("REDIRECT_MOVE");
    } else if (target === "/onboarding") {
      console.log("REDIRECT_ONBOARDING");
    } else {
      console.log("REDIRECT_ROOT_BOOT");
    }
    replaceWithHashRoute(target, { force: true });
  };

  const finalizeOAuthSuccess = async (sessionUserId: string) => {
    console.log("SESSION_RESTORED");
    logOAuthSuccess("auth_callback", { userId: redactUserId(sessionUserId) });
    console.log("AUTH_SESSION_READY", { userId: redactUserId(sessionUserId) });
    markOAuthSessionAt();
    logSetSessionResult(true, sessionUserId, null);
    setDebug((d) => ({
      ...d,
      userId: redactUserId(sessionUserId),
      exchangeResult: safeStringify({ ok: true, userId: redactUserId(sessionUserId) }),
    }));
    clearOauthCallbackStorage();
    await syncAuthSession();
    const sessionVerify = await verifyDefinitiveSupabaseSession("auth_callback_finalize");
    if (!sessionVerify.ok) {
      console.warn("[AuthCallback] redirect blocked — session not verified", sessionVerify.reason);
      failGoogleAndReturnToAuth(sessionVerify.reason);
      return;
    }
    await ensureProfileRowForAuthUserId(sessionUserId);
    const path = await resolvePostOAuthPath(supabase, sessionUserId);
    const navTarget = path === "/move" ? "/move" : path === "/onboarding" ? "/onboarding" : "/";
    logOAuthRedirectDestination("auth_callback_finalize", navTarget, {
      blocked: false,
      sessionVerified: true,
      oauthRoute: path,
    });
    console.log("[BOOT] route decision", { status: "ready", route: navTarget, oauthRoute: path, reason: "oauth_callback" });
    console.log("[BOOT] redirect to", navTarget);
    finish();
    void closeCapacitorOAuthBrowser();
    navigateAfterOAuth(navTarget);
    logOAuthRedirect();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    releaseOauthLock();
    clearAllOAuthSessionLocks();
    releaseGoogleOAuthFlowLock();
    dismissPostOAuthSplash();
  };

  const [debug, setDebug] = useState<CallbackDebug>(() => emptyDebug());
  const doneRef = useRef(false);
  const processingRef = useRef(false);
  const callbackUrlRef = useRef<string | null>(null);
  const runGenRef = useRef(0);
  const mountLocationRef = useRef({ search: location.search, hash: location.hash });

  useEffect(() => {
    hideCapacitorSplashWhenReady();
  }, []);

  const finish = () => {
    doneRef.current = true;
  };

  const releaseOauthLock = () => {
    clearOauthProcessingLock();
    console.log("[AuthCallback] oauth lock OFF");
  };

  const releaseOauthLockAndStorage = () => {
    releaseOauthLock();
    clearAllOAuthSessionLocks();
  };

  const logSetSessionResult = (hasSession: boolean, userId: string | null, errorMessage: string | null) => {
    console.log("[AuthCallback] setSession result", {
      hasSession,
      userId: redactUserId(userId),
      errorMessage,
    });
  };

  const failGoogleAndReturnToAuth = (tech: string) => {
    console.log(`OAuth error: ${tech}`);
    logSetSessionResult(false, null, tech);
    clearOauthCallbackStorage();
    finish();
    releaseGoogleOAuthFlowLock();
    releaseOauthLockAndStorage();
    dismissPostOAuthSplash();
    void closeCapacitorOAuthBrowser();
    stashAuthOAuthUserMessage(GOOGLE_OAUTH_USER_ERROR_MSG);
    replaceWithHashRoute("/auth", { force: true });
  };

  const succeedOAuthAndRedirect = async (sessionUserId: string) => {
    await finalizeOAuthSuccess(sessionUserId);
  };

  const failNoSession = (tech: string) => {
    failGoogleAndReturnToAuth(tech);
  };

  const redirectToDiscoverEmail = async (sessionUserId: string) => {
    await finalizeOAuthSuccess(sessionUserId);
  };

  useEffect(() => {
    const runGen = ++runGenRef.current;
    if (processingRef.current || doneRef.current) return;
    processingRef.current = true;
    const firstUrl = callbackUrlRef.current ?? peekOAuthCallbackUrl() ?? window.location.href;
    setDebug({ ...emptyDebug(), currentUrl: redactOAuthUrl(firstUrl) });

    const run = async () => {
      console.log("AUTH_INIT_START");
      try {
        if (runGen !== runGenRef.current) return;
        if (!callbackUrlRef.current) {
          callbackUrlRef.current = peekOAuthCallbackUrl() ?? window.location.href;
        }
        const href = callbackUrlRef.current;
        const params = resolveOAuthCallbackParams({
          storedDeepLinkUrl: peekOAuthCallbackUrl(),
          routerSearch: mountLocationRef.current.search,
          routerHash: mountLocationRef.current.hash,
        });
        console.log("[AuthCallback] hasAccessToken", params.hasAccessToken);
        console.log("[AuthCallback] hasRefreshToken", params.hasRefreshToken);
        console.log("[AuthCallback] parsed params source", params.source);
        setDebug((d) => ({
          ...d,
          currentUrl: redactOAuthUrl(href),
          hasAccessToken: params.hasAccessToken,
        }));

        if (params.accessToken && params.refreshToken) {
          const access_token = decodeOAuthToken(params.accessToken);
          const refresh_token = decodeOAuthToken(params.refreshToken);

          console.log("CALLBACK_SET_SESSION_START");
          console.log("[AuthCallback] setSession start");
          const outcome = await setOAuthSessionWithTimeout(
            access_token,
            refresh_token,
            GOOGLE_SET_SESSION_MS,
          );

          if (runGen !== runGenRef.current) return;

          if (outcome.timedOut) {
            console.log("CALLBACK_SET_SESSION_DONE", { ok: false, reason: "timeout" });
            console.log("[AuthCallback] setSession timeout");
            failGoogleAndReturnToAuth("setSession timeout");
            return;
          }

          if (outcome.error) {
            console.log("CALLBACK_SET_SESSION_DONE", { ok: false, reason: outcome.error.message });
            console.log("[AuthCallback] setSession error", outcome.error.message);
            failGoogleAndReturnToAuth(outcome.error.message);
            return;
          }

          const sessionFromSet = outcome.data.session;
          const sessionUserId = sessionFromSet?.user?.id ?? null;
          console.log("CALLBACK_SET_SESSION_DONE", { ok: Boolean(sessionUserId) });
          console.log("[AuthCallback] setSession hasSession", Boolean(sessionUserId));
          console.log("[AuthCallback] setSession userId", redactUserId(sessionUserId));

          if (!sessionUserId || !sessionFromSet) {
            console.log("[AuthCallback] setSession error", "no user in session");
            failGoogleAndReturnToAuth(ERR_NO_SESSION_USER);
            return;
          }

          await succeedOAuthAndRedirect(sessionUserId);
          return;
        }

        if (params.hasCode && params.code) {
          console.log("AUTH_CODE_FOUND");
          const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
          console.log("[AuthCallback] exchangeCodeForSession", formatExchangeCodeLog(exchanged));
          if (runGen !== runGenRef.current) return;
          if (exchanged.error) {
            failNoSession(exchanged.error.message);
            return;
          }
          if (exchanged.data.session?.user?.id) {
            await redirectToDiscoverEmail(exchanged.data.session.user.id);
            return;
          }
          failNoSession(ERR_NO_SESSION_USER);
          return;
        }

        failNoSession("Tokens OAuth introuvables (access_token / refresh_token).");
      } catch (e) {
        if (runGen !== runGenRef.current) return;
        const tech = e instanceof Error ? e.message : String(e);
        failNoSession(tech);
      }
    };

    void run();

    return () => {
      if (runGen !== runGenRef.current) return;
      if (!doneRef.current) {
        processingRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  return (
    <>
      <OAuthConnectingSplash logCallbackVisible />
      <DevDebugPanel debug={debug} />
    </>
  );
}
