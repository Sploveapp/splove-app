import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SplashScreen } from "../components/SplashScreen";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { ensureProfileRowForAuthUserId } from "../lib/authProfileSync";
import { BRAND_BG } from "../constants/theme";

const STEP_TIMEOUT_MS = 8000;
const SPLASH_MAX_MS = 8000;
const isDev = import.meta.env.DEV;

const ERR_PROFILE_STUCK =
  "Connexion Google réussie, mais finalisation du profil bloquée. Réessaie ou continue vers l’onboarding.";

const ERR_NO_SESSION_TITLE = "Session Google non récupérée";

type ProfileStatusRow = {
  profile_completed?: boolean | null;
  onboarding_completed?: boolean | null;
};

type CallbackDebug = {
  currentUrl: string;
  hasCode: boolean;
  exchangeResult: string;
  getSessionData: string;
  userId: string | null;
  profileResult: string;
  redirectTarget: string;
  finalError: string;
};

const emptyDebug = (): CallbackDebug => ({
  currentUrl: "",
  hasCode: false,
  exchangeResult: "—",
  getSessionData: "—",
  userId: null,
  profileResult: "—",
  redirectTarget: "—",
  finalError: "—",
});

function urlHasOauthCode(): boolean {
  const { search, hash, href } = window.location;
  return /[?&]code=/.test(search + hash) || /[?&]code=/.test(href);
}

function safeStringify(x: unknown, max = 2000): string {
  try {
    const s = JSON.stringify(
      x,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    );
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch (e) {
    return String(e);
  }
}

async function runStep<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let timer: number | undefined;
  try {
    const value = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error(`timeout after ${STEP_TIMEOUT_MS}ms`)),
          STEP_TIMEOUT_MS,
        );
      }),
    ]);
    if (timer !== undefined) window.clearTimeout(timer);
    return { ok: true, value };
  } catch (error) {
    if (timer !== undefined) window.clearTimeout(timer);
    return { ok: false, error };
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
        maxHeight: "42vh",
        overflow: "auto",
        zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        borderTop: "1px solid rgba(255,255,255,0.2)",
        padding: "10px 12px",
        fontSize: 11,
        lineHeight: 1.4,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        color: "rgba(255,255,255,0.92)",
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#22d3ee" }}>[AuthCallback] dev</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{safeStringify(debug, 4000)}</pre>
    </div>
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { syncAuthSession } = useAuth();
  const [error, setError] = useState<"noSession" | "profileStuck" | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [debug, setDebug] = useState<CallbackDebug>(() => emptyDebug());
  const doneRef = useRef(false);
  const cancelRef = useRef(false);

  const updateDebug = (patch: Partial<CallbackDebug>) => {
    setDebug((d) => ({ ...d, ...patch }));
  };

  useEffect(() => {
    cancelRef.current = false;
    doneRef.current = false;
    const firstUrl = window.location.href;
    setDebug({ ...emptyDebug(), currentUrl: firstUrl });
    setTechnicalError(null);
    setError(null);

    const capTimer = window.setTimeout(() => {
      if (doneRef.current) return;
      const msg = `timeout after ${SPLASH_MAX_MS}ms`;
      console.log("[AuthCallback] error", msg);
      updateDebug({ finalError: msg, redirectTarget: "—" });
      cancelRef.current = true;
      doneRef.current = true;
      setError("profileStuck");
    }, SPLASH_MAX_MS);

    const run = async () => {
      const href = window.location.href;
      console.log("[AuthCallback] URL", href);
      updateDebug({ currentUrl: href });

      const has = urlHasOauthCode();
      console.log("[AuthCallback] has code", has);
      updateDebug({ hasCode: has });

      let exchangeSummary: { data: unknown; error: unknown } | { skipped: true; reason: string } = {
        skipped: true,
        reason: "no code in URL",
      };

      if (has) {
        const ex = await runStep(() => supabase.auth.exchangeCodeForSession(href));
        if (cancelRef.current) return;
        if (ex.ok) {
          const v = ex.value as { data: unknown; error: { message?: string } | null };
          exchangeSummary = { data: v.data, error: v.error };
        } else {
          exchangeSummary = { data: null, error: ex.error };
        }
        console.log("[AuthCallback] exchange result", exchangeSummary);
        updateDebug({ exchangeResult: safeStringify(exchangeSummary) });
      } else {
        console.log("[AuthCallback] exchange result", exchangeSummary);
        updateDebug({ exchangeResult: safeStringify(exchangeSummary) });
      }

      const gs = await runStep(() => supabase.auth.getSession());
      if (cancelRef.current) return;

      if (!gs.ok) {
        const e = gs.error;
        const tech = e instanceof Error ? e.message : String(e);
        console.log("[AuthCallback] session", null);
        console.log("[AuthCallback] error", tech);
        updateDebug({ getSessionData: "step failed: " + tech, finalError: tech, redirectTarget: "—" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          setTechnicalError(tech);
          setError("noSession");
          doneRef.current = true;
        }
        return;
      }

      const { data: getSessionData, error: getSessionError } = gs.value;
      const session = getSessionData?.session ?? null;
      const sessionForLog = {
        session: session
          ? { userId: session.user?.id, expires_at: session.expires_at }
          : null,
        error: getSessionError?.message ?? getSessionError ?? null,
      };
      console.log("[AuthCallback] session", sessionForLog);
      updateDebug({ getSessionData: safeStringify(sessionForLog) });

      if (getSessionError) {
        const tech = getSessionError.message || String(getSessionError);
        console.log("[AuthCallback] error", tech);
        updateDebug({ finalError: tech, redirectTarget: "—" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          setTechnicalError(tech);
          setError("noSession");
          doneRef.current = true;
        }
        return;
      }

      if (!session?.user?.id) {
        const tech =
          "Aucune session utilisateur après getSession. Vérifie l’URL de redirection (Supabase) et le mode navigation privée / stockage des cookies.";
        console.log("[AuthCallback] error", tech);
        updateDebug({ finalError: tech, userId: null, redirectTarget: "—" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          setTechnicalError(tech);
          setError("noSession");
          doneRef.current = true;
        }
        return;
      }

      const uid = session.user.id;
      updateDebug({ userId: uid });

      const syncR = await runStep(() => syncAuthSession());
      if (cancelRef.current) return;
      if (!syncR.ok) {
        void syncAuthSession();
      } else if (!syncR.value) {
        void syncAuthSession();
      }

      const ensureR = await runStep(() => ensureProfileRowForAuthUserId(uid));
      if (cancelRef.current) return;

      if (!ensureR.ok || (ensureR.ok && !ensureR.value)) {
        const tech = !ensureR.ok
          ? String(ensureR.error)
          : "ensureProfileRowForAuthUserId returned false";
        console.log("[AuthCallback] error", tech);
        updateDebug({ profileResult: "ensure: " + tech, finalError: tech, redirectTarget: "/onboarding" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          doneRef.current = true;
          console.log("[AuthCallback] redirect target", "/onboarding");
          navigate("/onboarding", { replace: true });
        }
        return;
      }

      const profR = await runStep(async () => {
        return supabase
          .from("profiles")
          .select("profile_completed,onboarding_completed")
          .eq("id", uid)
          .maybeSingle<ProfileStatusRow>();
      });
      if (cancelRef.current) return;

      if (!profR.ok) {
        const tech = String(profR.error);
        console.log("[AuthCallback] profile", { failed: true, error: tech });
        console.log("[AuthCallback] error", tech);
        updateDebug({ profileResult: "fetch step failed: " + tech, finalError: tech, redirectTarget: "/onboarding" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          doneRef.current = true;
          console.log("[AuthCallback] redirect target", "/onboarding");
          navigate("/onboarding", { replace: true });
        }
        return;
      }

      const { data: profileRow, error: profileError } = profR.value as {
        data: ProfileStatusRow | null;
        error: { message?: string } | null;
      };
      const profileForLog = { data: profileRow, error: profileError };
      console.log("[AuthCallback] profile", profileForLog);
      updateDebug({ profileResult: safeStringify(profileForLog) });

      if (profileError) {
        const tech = profileError.message || String(profileError);
        console.log("[AuthCallback] error", tech);
        updateDebug({ finalError: tech, redirectTarget: "/onboarding" });
        window.clearTimeout(capTimer);
        if (!doneRef.current) {
          doneRef.current = true;
          console.log("[AuthCallback] redirect target", "/onboarding");
          navigate("/onboarding", { replace: true });
        }
        return;
      }

      const profile = profileRow;
      const done = Boolean(
        profile && (profile.profile_completed === true || profile.onboarding_completed === true),
      );
      const target = done ? "/discover" : "/onboarding";
      updateDebug({ redirectTarget: target, finalError: "—" });
      console.log("[AuthCallback] redirect target", target);

      window.clearTimeout(capTimer);
      if (!doneRef.current) {
        doneRef.current = true;
        navigate(target, { replace: true });
      }
    };

    void run().catch((e) => {
      const tech = e instanceof Error ? e.message : String(e);
      console.log("[AuthCallback] error", tech);
      updateDebug({ finalError: tech, redirectTarget: "—" });
      window.clearTimeout(capTimer);
      if (!doneRef.current) {
        doneRef.current = true;
        setTechnicalError(tech);
        setError("profileStuck");
      }
    });

    return () => {
      cancelRef.current = true;
      window.clearTimeout(capTimer);
    };
  }, [navigate, syncAuthSession]);

  if (error === "noSession") {
    return (
      <div
        className="flex min-h-screen w-full flex-col items-center justify-center gap-3 px-6 pb-48"
        style={{ backgroundColor: "#0B0B0F" }}
        role="alert"
      >
        <p
          style={{
            margin: 0,
            maxWidth: 400,
            textAlign: "center",
            color: "rgba(255,255,255,0.95)",
            fontSize: 17,
            lineHeight: 1.45,
            fontWeight: 600,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          }}
        >
          {ERR_NO_SESSION_TITLE}
        </p>
        {technicalError ? (
          <p
            style={{
              margin: 0,
              maxWidth: 480,
              textAlign: "left",
              color: "rgba(255,200,200,0.9)",
              fontSize: 12,
              lineHeight: 1.4,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {technicalError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            border: "none",
            background: "transparent",
            color: BRAND_BG,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          }}
        >
          Réessayer
        </button>
        <DevDebugPanel debug={debug} />
      </div>
    );
  }

  if (error === "profileStuck") {
    return (
      <div
        className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6 pb-48"
        style={{ backgroundColor: "#0B0B0F" }}
        role="alert"
      >
        <p
          style={{
            margin: 0,
            maxWidth: 380,
            textAlign: "center",
            color: "rgba(255,255,255,0.88)",
            fontSize: 16,
            lineHeight: 1.45,
            fontWeight: 500,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          }}
        >
          {ERR_PROFILE_STUCK}
        </p>
        {debug.finalError && debug.finalError !== "—" ? (
          <p
            style={{
              margin: 0,
              maxWidth: 480,
              textAlign: "left",
              color: "rgba(255,200,200,0.85)",
              fontSize: 11,
              lineHeight: 1.4,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {debug.finalError}
          </p>
        ) : null}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "none",
              background: "transparent",
              color: BRAND_BG,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
            }}
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => {
              void syncAuthSession();
              navigate("/onboarding", { replace: true });
            }}
            style={{
              border: "none",
              background: "transparent",
              color: BRAND_BG,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
            }}
          >
            Continuer vers l’onboarding
          </button>
        </div>
        <DevDebugPanel debug={debug} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full" style={{ backgroundColor: "#0B0B0F" }}>
      <SplashScreen />
      <DevDebugPanel debug={debug} />
    </div>
  );
}
