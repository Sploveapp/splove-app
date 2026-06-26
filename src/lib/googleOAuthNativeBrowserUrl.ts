import { buildOAuthGoogleStartBrowserUrl } from "./oauthGoogleStartUrl";

/**
 * URL ouverte dans Capacitor Browser pour Google OAuth natif.
 * Android : Supabase /authorize direct (évite https://localhost dans Custom Tabs).
 * iOS : page intermédiaire via buildOAuthGoogleStartBrowserUrl (résolu ailleurs par resolveIosGoogleOAuthBrowserTarget).
 */
export function googleOAuthNativeBrowserTargetUrl(
  supabaseAuthorizeUrl: string,
  platform: "ios" | "android",
): string {
  const trimmed = supabaseAuthorizeUrl.trim();
  if (platform === "android") {
    return trimmed;
  }
  return buildOAuthGoogleStartBrowserUrl(trimmed);
}
