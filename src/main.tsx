import { createRoot } from "react-dom/client";
import { ensureOauthCallbackBootstrapLock } from "./lib/oauthCallbackLock";
import { SplashScreen } from "./components/SplashScreen";

ensureOauthCallbackBootstrapLock();

const rootEl = document.getElementById("root");
if (!rootEl) {
  console.error("[App mount] #root introuvable");
} else {
  createRoot(rootEl).render(<SplashScreen overlay />);
  void import("./bootstrapApp");
}
