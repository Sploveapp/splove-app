import { describe, expect, it } from "vitest";
import { isGoogleAccountsOAuthUrl } from "./oauthGoogleBrowserUrl";

describe("oauthGoogleBrowserUrl", () => {
  it("reconnaît accounts.google.com", () => {
    expect(
      isGoogleAccountsOAuthUrl(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fxxx.supabase.co%2Fauth%2Fv1%2Fcallback",
      ),
    ).toBe(true);
    expect(isGoogleAccountsOAuthUrl("https://evil.supabase.co/auth/v1/authorize")).toBe(false);
  });
});
