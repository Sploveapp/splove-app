import { beforeEach, describe, expect, it } from "vitest";
import {
  resetOAuthTechnicalUrlGuardListenersForTests,
  windowLocationHasTechnicalOAuthUrl,
} from "./oauthVisualMask";

describe("oauthVisualMask — garde URL technique", () => {
  beforeEach(() => {
    resetOAuthTechnicalUrlGuardListenersForTests();
  });

  it("détecte supabase.co /auth/v1/authorize", () => {
    expect(
      windowLocationHasTechnicalOAuthUrl(
        "https://abc.supabase.co/auth/v1/authorize?provider=google",
        "",
      ),
    ).toBe(true);
  });

  it("détecte #/auth/callback", () => {
    expect(
      windowLocationHasTechnicalOAuthUrl("https://localhost/", "#/auth/callback?code=x"),
    ).toBe(true);
  });

  it("détecte /oauth/google-start", () => {
    expect(
      windowLocationHasTechnicalOAuthUrl("https://localhost/oauth/google-start", ""),
    ).toBe(true);
  });

  it("ignore une route app normale", () => {
    expect(
      windowLocationHasTechnicalOAuthUrl("https://localhost/", "#/move"),
    ).toBe(false);
  });
});
