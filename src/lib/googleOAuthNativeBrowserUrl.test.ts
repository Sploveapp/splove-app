import { describe, expect, it } from "vitest";
import { googleOAuthNativeBrowserTargetUrl } from "./googleOAuthNativeBrowserUrl";
import { isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

describe("googleOAuthNativeBrowserTargetUrl", () => {
  it("iOS ouvre l’URL Supabase authorize sans transformation", () => {
    const target = googleOAuthNativeBrowserTargetUrl(SUPABASE_AUTHORIZE, "ios");
    expect(target).toBe(SUPABASE_AUTHORIZE);
    expect(isSupabaseGoogleAuthorizeUrl(target)).toBe(true);
    expect(target).not.toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("Android conserve la page intermédiaire oauth/google/start", () => {
    const target = googleOAuthNativeBrowserTargetUrl(SUPABASE_AUTHORIZE, "android");
    expect(target).toContain("#/oauth/google/start");
    expect(target).toContain(encodeURIComponent(SUPABASE_AUTHORIZE));
  });
});
