import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GlobalHeader } from "../components/GlobalHeader";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import {
  getPasswordRecoveryError,
  markPasswordRecoveryFlowActive,
  setPasswordRecoveryError,
} from "../lib/passwordRecoveryDeepLink";

const VERIFY_POLL_INTERVAL_MS = 500;
const VERIFY_POLL_MAX_ATTEMPTS = 30;

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [verifyingLink, setVerifyingLink] = useState(true);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(() => getPasswordRecoveryError());
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    markPasswordRecoveryFlowActive(true);

    const initialError = getPasswordRecoveryError();
    if (initialError) {
      setRecoveryError(initialError);
      setSessionReady(false);
      setVerifyingLink(false);
      return;
    }

    let cancelled = false;

    async function checkSessionOrError(): Promise<"session" | "error" | "pending"> {
      const err = getPasswordRecoveryError();
      if (err) return "error";

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) return "session";
      return "pending";
    }

    async function pollForRecoverySession(): Promise<void> {
      for (let attempt = 0; attempt < VERIFY_POLL_MAX_ATTEMPTS && !cancelled; attempt++) {
        const outcome = await checkSessionOrError();
        if (outcome === "session") {
          setSessionReady(true);
          setRecoveryError(null);
          setPasswordRecoveryError(null);
          setVerifyingLink(false);
          return;
        }
        if (outcome === "error") {
          setRecoveryError(getPasswordRecoveryError());
          setSessionReady(false);
          setVerifyingLink(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, VERIFY_POLL_INTERVAL_MS));
      }

      if (cancelled) return;

      const finalError = getPasswordRecoveryError();
      if (finalError) {
        setRecoveryError(finalError);
      } else {
        setRecoveryError((prev) => prev ?? "Ce lien de réinitialisation n'est plus valide.");
      }
      setSessionReady(false);
      setVerifyingLink(false);
    }

    void pollForRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (session) {
          setSessionReady(true);
          setRecoveryError(null);
          setPasswordRecoveryError(null);
          setVerifyingLink(false);
        }
      }
    });

    const onRecoveryNavigate = () => {
      const err = getPasswordRecoveryError();
      if (err) {
        setRecoveryError(err);
        setSessionReady(false);
        setVerifyingLink(false);
        return;
      }
      void checkSessionOrError().then((outcome) => {
        if (outcome === "session") {
          setSessionReady(true);
          setRecoveryError(null);
          setPasswordRecoveryError(null);
          setVerifyingLink(false);
        }
      });
    };

    window.addEventListener("splove:password-recovery:navigate", onRecoveryNavigate);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("splove:password-recovery:navigate", onRecoveryNavigate);
    };
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
      markPasswordRecoveryFlowActive(false);
      setPasswordRecoveryError(null);
      await supabase.auth.signOut();
      setPasswordChanged(true);
      setMessage(null);
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Une erreur s'est produite.",
      });
    } finally {
      setLoading(false);
    }
  }

  const linkInvalid = Boolean(recoveryError) && !verifyingLink && sessionReady === false;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0F0F14",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <GlobalHeader />
      <div style={{ flex: 1, minHeight: 0, padding: "24px" }}>
        <div
          className="splove-auth-light-card"
          style={{
            width: "100%",
            maxWidth: "360px",
            margin: "0 auto",
            background: "#ffffff",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          {passwordChanged ? (
            <>
              <h1
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#0f172a",
                  textAlign: "center",
                }}
              >
                Mot de passe modifié
              </h1>
              <p
                style={{
                  margin: "0 0 24px 0",
                  fontSize: "14px",
                  color: "#059669",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                Votre mot de passe a bien été modifié.
              </p>
              <Link
                to="/auth"
                style={{
                  display: "block",
                  padding: "14px",
                  borderRadius: "12px",
                  background: BRAND_BG,
                  color: TEXT_ON_BRAND,
                  fontWeight: 600,
                  fontSize: "16px",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Se connecter
              </Link>
            </>
          ) : linkInvalid ? (
            <>
              <h1
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#0f172a",
                  textAlign: "center",
                }}
              >
                Lien expiré
              </h1>
              <p
                style={{
                  margin: "0 0 24px 0",
                  fontSize: "14px",
                  color: "#dc2626",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {recoveryError ?? "Ce lien de réinitialisation n'est plus valide."}
              </p>
              <Link
                to="/forgot-password"
                style={{
                  display: "block",
                  padding: "14px",
                  borderRadius: "12px",
                  background: BRAND_BG,
                  color: TEXT_ON_BRAND,
                  fontWeight: 600,
                  fontSize: "16px",
                  textAlign: "center",
                  textDecoration: "none",
                }}
                onClick={() => {
                  markPasswordRecoveryFlowActive(false);
                  setPasswordRecoveryError(null);
                }}
              >
                Demander un nouveau lien
              </Link>
            </>
          ) : (
            <>
              <h1
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#0f172a",
                  textAlign: "center",
                }}
              >
                Créer un nouveau mot de passe
              </h1>
              {verifyingLink && sessionReady !== true ? (
                <p
                  style={{
                    margin: "0 0 24px 0",
                    fontSize: "14px",
                    color: "#64748b",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  Vérification du lien…
                </p>
              ) : (
                <p
                  style={{
                    margin: "0 0 24px 0",
                    fontSize: "14px",
                    color: "#64748b",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  Choisissez un mot de passe sécurisé pour votre compte.
                </p>
              )}

              <form
                onSubmit={(e) => void handleSubmit(e)}
                style={{ display: "flex", flexDirection: "column", gap: "16px" }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                    Nouveau mot de passe
                  </span>
                  <input
                    type="password"
                    placeholder="Nouveau mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={verifyingLink || sessionReady !== true}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "1px solid #2A2A2E",
                      fontSize: "16px",
                      outline: "none",
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                    Confirmer le nouveau mot de passe
                  </span>
                  <input
                    type="password"
                    placeholder="Confirmer le nouveau mot de passe"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={verifyingLink || sessionReady !== true}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "1px solid #2A2A2E",
                      fontSize: "16px",
                      outline: "none",
                    }}
                  />
                </label>
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
                  disabled={loading || verifyingLink || sessionReady !== true}
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    border: "none",
                    background: BRAND_BG,
                    color: TEXT_ON_BRAND,
                    fontWeight: 600,
                    fontSize: "16px",
                    cursor: loading || verifyingLink || sessionReady !== true ? "not-allowed" : "pointer",
                    opacity: loading || verifyingLink || sessionReady !== true ? 0.8 : 1,
                  }}
                >
                  {loading ? "Chargement…" : "Modifier mon mot de passe"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
