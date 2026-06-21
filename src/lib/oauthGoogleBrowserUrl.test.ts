import { describe, expect, it } from "vitest";
import {
  hasRequiredGoogleOAuthParams,
  isCompleteGoogleOAuthAuthorizeUrl,
  isGoogleAccountsOAuthUrl,
  REQUIRED_GOOGLE_OAUTH_PARAMS,
} from "./oauthGoogleBrowserUrl";

const COMPLETE_GOOGLE_OAUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  "client_id=abc.apps.googleusercontent.com" +
  "&redirect_uri=https%3A%2F%2Fxxx.supabase.co%2Fauth%2Fv1%2Fcallback" +
  "&response_type=code" +
  "&scope=openid%20email%20profile" +
  "&state=xyz" +
  "&code_challenge=challenge&code_challenge_method=S256";

describe("oauthGoogleBrowserUrl", () => {
  it("reconnaît accounts.google.com", () => {
    expect(isGoogleAccountsOAuthUrl(COMPLETE_GOOGLE_OAUTH_URL)).toBe(true);
    expect(isGoogleAccountsOAuthUrl("https://evil.supabase.co/auth/v1/authorize")).toBe(false);
  });

  it("exige les paramètres OAuth minimum", () => {
    expect(REQUIRED_GOOGLE_OAUTH_PARAMS).toEqual([
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ]);
    expect(hasRequiredGoogleOAuthParams(COMPLETE_GOOGLE_OAUTH_URL)).toBe(true);
  });

  it("rejette une page sign-in Google sans paramètres OAuth", () => {
    const signInOnly = "https://accounts.google.com/signin/oauth/id?continue=https%3A%2F%2Fexample.com";
    expect(isGoogleAccountsOAuthUrl(signInOnly)).toBe(true);
    expect(hasRequiredGoogleOAuthParams(signInOnly)).toBe(false);
    expect(isCompleteGoogleOAuthAuthorizeUrl(signInOnly)).toBe(false);
  });

  it("rejette une URL Google incomplète si un paramètre requis manque", () => {
    for (const missing of REQUIRED_GOOGLE_OAUTH_PARAMS) {
      const parsed = new URL(COMPLETE_GOOGLE_OAUTH_URL);
      parsed.searchParams.delete(missing);
      expect(hasRequiredGoogleOAuthParams(parsed.href)).toBe(false);
      expect(isCompleteGoogleOAuthAuthorizeUrl(parsed.href)).toBe(false);
    }
  });

  it("accepte uniquement une URL Google OAuth complète", () => {
    expect(isCompleteGoogleOAuthAuthorizeUrl(COMPLETE_GOOGLE_OAUTH_URL)).toBe(true);
    expect(isCompleteGoogleOAuthAuthorizeUrl("https://accounts.google.com/o/oauth2/v2/auth")).toBe(
      false,
    );
  });
});
