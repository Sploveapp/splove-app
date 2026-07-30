import { buildOAuthGoogleStartBrowserUrl } from "./oauthGoogleStartUrl";

/**
 * URL ouverte dans Capacitor Browser pour Google OAuth natif.
 * iOS / Android : la résolution HTTP vers accounts.google.com est faite dans capacitorOAuth
 * avant Browser.open — cette helper ne doit plus servir à ouvrir *.supabase.co.
 * Conservée pour compat tests / page start iOS historique.
 */
export function googleOAuthNativeBrowserTargetUrl(
  supabaseAuthorizeUrl: string,
  platform: "ios" | "android",
): string {
  const trimmed = supabaseAuthorizeUrl.trim();
  if (platform === "android") {
    // Ne plus retourner l’URL Supabase (flash Custom Tabs). Le caller doit résoudre vers Google.
    return trimmed;
  }
  return buildOAuthGoogleStartBrowserUrl(trimmed);
}
