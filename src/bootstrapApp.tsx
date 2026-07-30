import "./lib/installOAuthSafeConsole";
import "./lib/installCapacitorBridgeLogSanitizer";
import { isOauthProcessingLocked } from "./lib/oauthCallbackLock";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  StrictMode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/globals.css";
import { initTheme } from "./lib/theme";
import { initCapacitorAuthBridge } from "./lib/capacitorOAuth";
import { isNativeCapacitorApp } from "./lib/authRedirect";
import { initPushNotificationHandlersEarly } from "./lib/pushNotifications";
import { initGoogleNativeSignIn } from "./lib/googleNativeSignIn";
import { probeSupabaseAuthHealth } from "./lib/supabaseDiagnostics";
import {
  isWebOAuthSplashRequested,
  restoreWebOAuthSplashFromStorage,
  shouldRestoreWebOAuthSplashFromStorage,
} from "./lib/webOAuthSplash";
import { showGoogleSignInOverlay } from "./lib/googleSignInOverlay";

console.log("[main bootstrap]", "profile-tab-fix-v2");

initTheme();

initCapacitorAuthBridge();
if (isNativeCapacitorApp()) {
  void initPushNotificationHandlersEarly();
  void initGoogleNativeSignIn();
}
if (shouldRestoreWebOAuthSplashFromStorage()) {
  restoreWebOAuthSplashFromStorage();
}
if (isWebOAuthSplashRequested()) {
  showGoogleSignInOverlay();
}
if (isOauthProcessingLocked()) {
  console.log("[main bootstrap] oauth processing lock active");
}
if (isNativeCapacitorApp()) {
  void probeSupabaseAuthHealth().then((probe) => {
    console.log("[main] supabase health probe (native)", probe);
  });
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(err: Error): { message: string } {
    return { message: err.message || "Erreur inconnue" };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("[App error boundary]", err, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#0F0F14",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              color: "#b91c1c",
              margin: 0,
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            Impossible d’afficher l’application.
          </p>
          <p
            style={{
              color: "#64748b",
              marginTop: 12,
              fontSize: 14,
              textAlign: "center",
              maxWidth: 420,
            }}
          >
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}
