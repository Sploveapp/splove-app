import {
  Component,
  type ErrorInfo,
  type ReactNode,
  StrictMode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/globals.css";

console.log("[main bootstrap]");

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
if (!rootEl) {
  console.error("[App mount] #root introuvable");
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}
