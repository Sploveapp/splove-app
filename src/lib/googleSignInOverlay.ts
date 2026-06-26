import { isNativeCapacitorApp } from "./authRedirect";
import { getLanguage, translate } from "../i18n/index";
import { publicAssetUrl } from "./publicAssetUrl";
import { forceClearPostOAuthSplash } from "./postOAuthSplash";
import { notifyOAuthUxOverlayChanged } from "./oauthUxNotify";

const OVERLAY_ROOT_ID = "splove-google-oauth-overlay";
const OVERLAY_Z_INDEX = 100_000;
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function devLog(event: string, extra?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(event, extra);
  } else {
    console.log(event);
  }
}

function overlayCopy(): { title: string; subtitle: string } {
  const lang = getLanguage();
  return {
    title: translate(lang, "auth_google_oauth_overlay_title"),
    subtitle: translate(lang, "auth_google_oauth_overlay_subtitle"),
  };
}

/** Overlay DOM synchrone — pur visuel, sans postOAuthSplash ni clés Supabase. */
function mountImperativeOverlay(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ROOT_ID)) return;

  const { title, subtitle } = overlayCopy();
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", title);
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: String(OVERLAY_Z_INDEX),
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0B0B0F",
    fontFamily: FONT,
  });

  const center = document.createElement("div");
  Object.assign(center.style, {
    position: "relative",
    flex: "1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 32px",
  });

  const glow = document.createElement("div");
  glow.setAttribute("aria-hidden", "true");
  Object.assign(glow.style, {
    pointerEvents: "none",
    position: "absolute",
    inset: "0",
    background:
      "radial-gradient(ellipse 70% 50% at 50% 42%, rgba(255, 30, 45, 0.14) 0%, transparent 68%)",
  });
  center.appendChild(glow);

  const logo = document.createElement("img");
  logo.src = publicAssetUrl("logo.png");
  logo.alt = "";
  logo.setAttribute("aria-hidden", "true");
  logo.width = 148;
  logo.height = 148;
  Object.assign(logo.style, {
    width: "148px",
    height: "148px",
    objectFit: "contain",
    display: "block",
    position: "relative",
  });
  center.appendChild(logo);

  const titleEl = document.createElement("p");
  titleEl.textContent = title;
  Object.assign(titleEl.style, {
    margin: "28px 0 0",
    fontSize: "17px",
    fontWeight: "600",
    letterSpacing: "-0.02em",
    color: "rgba(255,255,255,0.94)",
    textAlign: "center",
    position: "relative",
  });
  center.appendChild(titleEl);

  const subtitleEl = document.createElement("p");
  subtitleEl.textContent = subtitle;
  Object.assign(subtitleEl.style, {
    margin: "10px 0 0",
    maxWidth: "280px",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.45",
    color: "rgba(255,255,255,0.52)",
    textAlign: "center",
    position: "relative",
  });
  center.appendChild(subtitleEl);

  const footer = document.createElement("footer");
  Object.assign(footer.style, {
    pointerEvents: "none",
    flexShrink: "0",
    textAlign: "center",
    paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px))",
    paddingLeft: "24px",
    paddingRight: "24px",
  });
  const brand = document.createElement("p");
  brand.textContent = "SPLove";
  Object.assign(brand.style, {
    margin: "0",
    fontSize: "18px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    color: "rgba(255,255,255,0.72)",
  });
  footer.appendChild(brand);

  root.appendChild(center);
  root.appendChild(footer);
  document.body.appendChild(root);
}

function unmountImperativeOverlay(): void {
  document.getElementById(OVERLAY_ROOT_ID)?.remove();
}

/** Overlay DOM impératif encore monté (hors état React). */
export function isGoogleSignInOverlayMounted(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById(OVERLAY_ROOT_ID));
}

/** Laisse le navigateur peindre l’overlay impératif avant Browser.open(). */
export function awaitGoogleSignInOverlayPaint(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Overlay SPLove — clic « Continuer avec Google » (Capacitor). */
export function showGoogleSignInOverlay(): void {
  if (!isNativeCapacitorApp()) return;
  mountImperativeOverlay();
  console.log("OAUTH_LOADING_SCREEN_SHOW", {
    gate: "googleSignInOverlay",
    reasons: ["imperative_dom_overlay"],
  });
  console.log("OAUTH_LOADING_SCREEN_REASON", {
    gate: "googleSignInOverlay",
    reasons: ["imperative_dom_overlay"],
  });
  devLog("GOOGLE_SIGNIN_OVERLAY_SHOW");
}

/** Retire l’overlay (succès routé, erreur, annulation). */
export function hideGoogleSignInOverlay(reason?: string): void {
  if (!isNativeCapacitorApp()) return;
  const wasMounted = isGoogleSignInOverlayMounted();
  unmountImperativeOverlay();
  forceClearPostOAuthSplash();
  notifyOAuthUxOverlayChanged();
  if (wasMounted) {
    console.log("OAUTH_LOADING_SCREEN_HIDE", {
      gate: "googleSignInOverlay",
      reasons: reason ? [reason] : ["imperative_dom_overlay"],
    });
    console.log("OAUTH_LOADING_SCREEN_REASON", {
      gate: "googleSignInOverlay",
      reasons: reason ? [reason, "imperative_dom_unmount"] : ["imperative_dom_unmount"],
      phase: "hide",
    });
  }
  if (reason) {
    console.log("GOOGLE_SIGNIN_OVERLAY_HIDE", { reason });
  } else {
    console.log("GOOGLE_SIGNIN_OVERLAY_HIDE");
  }
}

/** Fermeture navigateur sans callback — garde l’overlay si OAuth en cours. */
export function dismissGoogleSignInOverlayIfIdle(): void {
  if (!isNativeCapacitorApp()) return;
  unmountImperativeOverlay();
  forceClearPostOAuthSplash();
  notifyOAuthUxOverlayChanged();
  devLog("GOOGLE_SIGNIN_OVERLAY_HIDE", { reason: "browser_closed_idle" });
}

export function logGoogleSignInBrowserOpen(): void {
  devLog("GOOGLE_SIGNIN_BROWSER_OPEN");
}

export function logGoogleSignInCallbackReceived(): void {
  console.log("AUTH_CALLBACK_RECEIVED");
  devLog("GOOGLE_SIGNIN_CALLBACK_RECEIVED");
}
