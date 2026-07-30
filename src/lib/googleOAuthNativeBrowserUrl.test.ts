import { describe, expect, it } from "vitest";
import { googleOAuthNativeBrowserTargetUrl } from "./googleOAuthNativeBrowserUrl";
import { isSupabaseGoogleAuthorizeUrl } from "./oauthGoogleStartUrl";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

describe("googleOAuthNativeBrowserTargetUrl", () => {
  it("Android : helper historique — Capacitor résout vers Google avant Browser.open", () => {
    const androidTarget = googleOAuthNativeBrowserTargetUrl(SUPABASE_AUTHORIZE, "android");
    expect(androidTarget).toBe(SUPABASE_AUTHORIZE);
    expect(isSupabaseGoogleAuthorizeUrl(androidTarget)).toBe(true);
    expect(androidTarget).not.toContain("localhost");
    expect(androidTarget).not.toContain("#/oauth/google/start");
  });

  it("iOS conserve la page intermédiaire oauth/google/start", () => {
    const iosTarget = googleOAuthNativeBrowserTargetUrl(SUPABASE_AUTHORIZE, "ios");
    expect(iosTarget).toContain("#/oauth/google/start");
    expect(iosTarget).toContain(encodeURIComponent(SUPABASE_AUTHORIZE));
    expect(isSupabaseGoogleAuthorizeUrl(iosTarget)).toBe(false);
  });
});
