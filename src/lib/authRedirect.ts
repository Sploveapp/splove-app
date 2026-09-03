import { Capacitor } from "@capacitor/core";
import { isOauthProcessingLocked } from "./oauthCallbackLock";

/** Custom URL scheme OAuth iOS/Android (Info.plist scheme `splove` + Supabase Redirect URLs). */
export const NATIVE_OAUTH_SCHEME = "splove";
/** Deep link OAuth natif — host `auth`, path `/callback` (pas de localhost). */
export const NATIVE_OAUTH_CALLBACK = `${NATIVE_OAUTH_SCHEME}://auth/callback`;
/** Deep link récupération mot de passe natif — distinct du callback OAuth. */
export const NATIVE_PASSWORD_RECOVERY_CALLBACK = `${NATIVE_OAUTH_SCHEME}://auth/recovery`;
/** Deep link reset password via token_hash + verifyOtp (parcours principal iOS). */
export const NATIVE_PASSWORD_RESET_CALLBACK = `${NATIVE_OAUTH_SCHEME}://auth/reset-password`;
/** Ancien deep link — conservé pour compatibilité Supabase / builds précédents. */
export const NATIVE_OAUTH_CALLBACK_LEGACY = `${NATIVE_OAUTH_SCHEME}://login-callback`;

/** Google OAuth Capacitor iOS/Android — ne jamais utiliser window.location.origin. */
export function isGoogleOAuthNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return true;
  if (Capacitor.isNativePlatform()) return true;
  return isNativeCapacitorApp();
}

/** True si l’URL est splove://auth/reset-password (token_hash recovery). */
export function isNativePasswordResetUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith(NATIVE_PASSWORD_RESET_CALLBACK)) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "splove:") return false;
    return parsed.hostname === "auth" && /^\/reset-password\/?$/i.test(parsed.pathname);
  } catch {
    return /splove:\/\/auth\/reset-password/i.test(trimmed);
  }
}

/** True si l’URL est un retour récupération mot de passe natif (splove://auth/recovery). */
export function isNativePasswordRecoveryUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  if (isNativePasswordResetUrl(trimmed)) return true;
  if (trimmed.startsWith(NATIVE_PASSWORD_RECOVERY_CALLBACK)) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "splove:") return false;
    return parsed.hostname === "auth" && /^\/recovery\/?$/i.test(parsed.pathname);
  } catch {
    return /splove:\/\/auth\/recovery/i.test(trimmed);
  }
}

/** True si l’URL est un retour OAuth natif (splove://auth/callback ou legacy login-callback). */
export function isNativeOAuthCallbackUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith(NATIVE_OAUTH_CALLBACK) || trimmed.startsWith(NATIVE_OAUTH_CALLBACK_LEGACY)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "splove:") return false;
    if (parsed.hostname === "login-callback") return true;
    return parsed.hostname === "auth" && /^\/callback\/?$/i.test(parsed.pathname);
  } catch {
    return /splove:\/\/(?:auth\/callback|login-callback)/i.test(trimmed);
  }
}

/** redirectTo OAuth natif — ne jamais dériver de window.location.origin (WKWebView = localhost). */
export function nativeOAuthRedirectTo(): string {
  return NATIVE_OAUTH_CALLBACK;
}

const LOCALHOST_OAUTH_REDIRECT =
  /(?:^|\/\/)(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$|[?#])/i;

/** True si l’URL cible un redirect OAuth interdit sur mobile (localhost / 127.0.0.1). */
export function isForbiddenOAuthRedirectTarget(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  let decoded = url.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  return LOCALHOST_OAUTH_REDIRECT.test(decoded);
}

/** Capacitor WKWebView origins — not valid OAuth return targets. */
const CAPACITOR_WEBVIEW_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

/**
 * True when running inside a Capacitor native shell (iOS/Android).
 * Falls back to WebView origin because iOS uses `https://localhost` as origin.
 */
export function isNativeCapacitorApp(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return true;
  return CAPACITOR_WEBVIEW_ORIGINS.has(window.location.origin);
}

/**
 * URLs passées à Supabase (`redirectTo`, recovery, OAuth) doivent refléter l’origine
 * actuelle du navigateur (localhost en dev, domaine Render en prod). Ne pas figer
 * de domaine de déploiement dans le code.
 */
export function authRedirectBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/**
 * Supabase OAuth `redirectTo`.
 * - Native Capacitor: custom scheme deep link (never https://localhost).
 * - Web (Render, Vite dev): same-origin /auth/callback (HashRouter normalizes in App.tsx).
 */
export function oauthRedirectUrl(): string {
  if (isGoogleOAuthNativePlatform()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return `${window.location.origin}/auth/callback`;
}

/** Origine web publique (email recovery → Safari). Sur natif : env ou prod Render. */
export function getPublicAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && !isNativeCapacitorApp()) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://splove-app.onrender.com";
}

/** URL HTTPS pont email → app native (Gmail / Safari). */
export function passwordRecoveryHttpsBridgeUrl(): string {
  return `${getPublicAppOrigin()}/reset-password`;
}

/** Lien HTTPS dans l’email Supabase — pont Safari → splove:// (verifyOtp dans l’app). */
export function passwordRecoveryRedirectUrl(): string {
  return passwordRecoveryHttpsBridgeUrl();
}

/** HashRouter: route lives in `location.hash` (`#/auth/callback?...`); or full path for direct loads. */
export function isAuthCallbackPath(): boolean {
  if (typeof window === "undefined") return false;
  if (/^#\/auth\/callback([/?]|$)/.test(window.location.hash || "")) return true;
  // Capacitor iOS : callback via deep link splove:// — pas de pathname /auth/callback bloquant.
  if (isNativeCapacitorApp()) return false;
  return (
    window.location.pathname === "/auth/callback" ||
    window.location.pathname.endsWith("/auth/callback")
  );
}

/**
 * After OAuth, react-router `navigate` only updates the hash and leaves `pathname` as `/auth/callback`
 * (`/auth/callback#/profile`). Full replace normalizes to `origin#/…`.
 */
export function replaceWithHashRoute(routePath: string, options?: { force?: boolean }): void {
  if (!options?.force && isOauthProcessingLocked()) {
    console.log("[authRedirect] replace blocked — oauth processing", routePath);
    return;
  }
  const path = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (isNativeCapacitorApp()) {
    window.location.hash = `#${path}`;
    return;
  }
  window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}#${path}`);
}

/** Strip OAuth tokens from the current URL (web only — iOS WKWebView bloque replaceState). */
export function scrubOAuthTokensFromBrowserUrl(): void {
  if (typeof window === "undefined" || isNativeCapacitorApp()) return;
  const raw = `${window.location.search}${window.location.hash}`;
  if (!/access_token|refresh_token|provider_token|(?:^|[?&#])code=/i.test(raw)) return;
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  window.history.replaceState(null, "", `${base}#/auth/callback`);
}
