import { describe, expect, it } from "vitest";
import {
  OAUTH_GOOGLE_START_PATH,
  buildOAuthGoogleStartBrowserUrl,
  isOAuthGoogleStartPath,
  isSupabaseGoogleAuthorizeUrl,
  parseOAuthGoogleStartAuthUrl,
} from "./oauthGoogleStartUrl";

describe("oauthGoogleStartUrl", () => {
  const supabaseUrl =
    "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

  it("reconnaît l’URL authorize Supabase Google", () => {
    expect(isSupabaseGoogleAuthorizeUrl(supabaseUrl)).toBe(true);
    expect(isSupabaseGoogleAuthorizeUrl("https://evil.com/authorize?provider=google")).toBe(false);
  });

  it("construit la route hash start avec auth_url", () => {
    const built = buildOAuthGoogleStartBrowserUrl(supabaseUrl);
    expect(built).toContain(`#${OAUTH_GOOGLE_START_PATH}?`);
    expect(built).toContain(encodeURIComponent(supabaseUrl));
  });

  it("parse auth_url depuis search", () => {
    const params = new URLSearchParams({ auth_url: supabaseUrl });
    expect(parseOAuthGoogleStartAuthUrl(`?${params.toString()}`, "")).toBe(supabaseUrl);
  });

  it("détecte le pathname start", () => {
    expect(isOAuthGoogleStartPath("/oauth/google/start")).toBe(true);
    expect(isOAuthGoogleStartPath("/auth")).toBe(false);
  });
});
