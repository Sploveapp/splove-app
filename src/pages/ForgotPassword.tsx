import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import {
  isGoogleOAuthNativePlatform,
  passwordRecoveryRedirectUrl,
} from "../lib/authRedirect";
import {
  logPasswordRecoveryRedirectTo,
} from "../lib/passwordRecoveryBootstrap";
import { GlobalHeader } from "../components/GlobalHeader";
import { KeyboardAwareScrollShell } from "../components/KeyboardAwareScrollShell";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";
import "./ForgotPasswordEmailInput.css";

function formatResetPasswordError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Une erreur s'est produite.";
}

function logResetPasswordError(err: unknown): void {
  if (err && typeof err === "object") {
    const authErr = err as { message?: string; code?: string; status?: number; name?: string };
    console.log("[RESET] error.code:", authErr.code ?? null);
    console.log("[RESET] error.status:", authErr.status ?? null);
    console.log("[RESET] error.message:", authErr.message ?? null);
    console.log("[RESET] error.name:", authErr.name ?? null);
    return;
  }
  console.log("[RESET] error (non-object):", err);
}

/** iOS WKWebView : setProperty(…, 'important') prime sur l’UA dark + héritage body #FFF. */
function applyForgotEmailInputColors(el: HTMLInputElement | null): void {
  if (!el) return;
  el.style.setProperty("color", "#111827", "important");
  el.style.setProperty("-webkit-text-fill-color", "#111827", "important");
  el.style.setProperty("color-scheme", "light", "important");
  el.style.setProperty("opacity", "1", "important");
  el.style.setProperty("background-color", "#ffffff", "important");
  el.style.setProperty("caret-color", "#0A84FF", "important");
}

export default function ForgotPassword() {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const submitInFlightRef = useRef(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const syncEmailInputColors = useCallback(() => {
    applyForgotEmailInputColors(emailInputRef.current);
  }, []);

  useLayoutEffect(() => {
    syncEmailInputColors();
  }, [syncEmailInputColors, email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || submitInFlightRef.current) {
      console.warn("[RESET] skipped — request already in flight");
      return;
    }

    setMessage(null);
    setLoading(true);
    submitInFlightRef.current = true;

    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo = passwordRecoveryRedirectUrl();
    logPasswordRecoveryRedirectTo(redirectTo);

    console.log("[RESET] email:", normalizedEmail);
    console.log("[RESET] platform:", Capacitor.getPlatform());
    console.log("[RESET] isNativeCapacitor:", isGoogleOAuthNativePlatform());

    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      console.log("[RESET] data:", data);
      console.log("[RESET] error:", error);

      if (error) {
        logResetPasswordError(error);
        console.log("[RESET] accepted:", false);
        throw error;
      }

      console.log("[RESET] accepted:", true);
      setMessage({
        type: "success",
        text: "E-mail envoyé. Consultez votre boîte mail pour choisir un nouveau mot de passe.",
      });
    } catch (err: unknown) {
      console.log("[RESET] caught:", err);
      logResetPasswordError(err);
      console.log("[RESET] accepted:", false);
      setMessage({
        type: "error",
        text: formatResetPasswordError(err),
      });
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  }

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
      <KeyboardAwareScrollShell style={{ flex: 1, minHeight: 0, padding: "24px" }}>
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
              ref={emailInputRef}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                applyForgotEmailInputColors(e.currentTarget);
              }}
              onInput={(e) => applyForgotEmailInputColors(e.currentTarget)}
              onFocus={(e) => applyForgotEmailInputColors(e.currentTarget)}
              required
              autoComplete="email"
              className="splove-forgot-email-input"
              style={{
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                fontSize: "16px",
                outline: "none",
                color: "#111827",
                WebkitTextFillColor: "#111827",
                opacity: 1,
                caretColor: "#0A84FF",
                backgroundColor: "#FFFFFF",
                colorScheme: "light",
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
      </KeyboardAwareScrollShell>
    </div>
  );
}
