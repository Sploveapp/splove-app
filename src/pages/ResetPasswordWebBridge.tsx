import { useCallback, useEffect, useRef } from "react";
import {
  openNativePasswordRecoveryApp,
  readWebBridgeRecoveryParams,
} from "../lib/passwordRecoveryWebBridge";
import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

const AUTO_OPEN_DELAY_MS = 400;

/**
 * Pont HTTPS → splove:// pour les e-mails (Gmail neutralise splove://).
 * Aucun verifyOtp ici — le token est consommé uniquement dans l’app native.
 */
export default function ResetPasswordWebBridge() {
  const openedRef = useRef(false);
  const { tokenHash, type, deepLink } = readWebBridgeRecoveryParams();

  const openApp = useCallback(() => {
    if (!deepLink || openedRef.current) return;
    openedRef.current = true;
    console.log("[PASSWORD_RECOVERY] incoming token hash =", tokenHash?.slice(0, 8) ?? null);
    console.log("[PASSWORD_RECOVERY] web bridge open app", { type });
    openNativePasswordRecoveryApp(deepLink);
  }, [deepLink, tokenHash, type]);

  useEffect(() => {
    if (!deepLink) return;
    const timer = window.setTimeout(() => {
      openApp();
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deepLink, openApp]);

  if (!tokenHash || type !== "recovery" || !deepLink) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0F0F14",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#f87171", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
          Lien incomplet ou invalide.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#0F0F14",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#ffffff",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 20,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Réinitialiser votre mot de passe
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: 14,
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          Ouvrez SPLove pour choisir un nouveau mot de passe. Si l’application ne s’ouvre pas
          automatement, utilisez le bouton ci-dessous.
        </p>
        <button
          type="button"
          onClick={openApp}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: BRAND_BG,
            color: TEXT_ON_BRAND,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Ouvrir SPLove
        </button>
      </div>
    </div>
  );
}
