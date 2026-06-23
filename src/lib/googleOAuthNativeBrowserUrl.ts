import { buildOAuthGoogleStartBrowserUrl } from "./oauthGoogleStartUrl";

/**
 * URL ouverte dans Capacitor Browser pour Google OAuth natif.
 * iOS : Supabase /authorize direct (redirect HTTP 302 fiable dans SFSafariViewController).
 * Android : page intermédiaire SPLove (inchangé).
 */
export function googleOAuthNativeBrowserTargetUrl(
  supabaseAuthorizeUrl: string,
  platform: "ios" | "android",
): string {
  const trimmed = supabaseAuthorizeUrl.trim();
  if (platform === "ios") {
    return trimmed;
  }
  return buildOAuthGoogleStartBrowserUrl(trimmed);
}
