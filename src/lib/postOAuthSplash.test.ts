import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./authRedirect", () => ({
  isNativeCapacitorApp: () => true,
}));

const {
  abortPostOAuthSplash,
  beginPostOAuthSplash,
  isPostOAuthFinalLandingPath,
  isPostOAuthSplashRequested,
  tryDismissPostOAuthSplashAfterLanding,
} = await import("./postOAuthSplash");

describe("postOAuthSplash — règles dismiss overlay OAuth", () => {
  beforeEach(() => {
    abortPostOAuthSplash();
  });

  it("beginPostOAuthSplash active l’overlay", () => {
    beginPostOAuthSplash();
    expect(isPostOAuthSplashRequested()).toBe(true);
  });

  it("tryDismiss ne retire l’overlay que sur les routes finales avec session + profil", () => {
    beginPostOAuthSplash();

    tryDismissPostOAuthSplashAfterLanding("/auth/callback", {
      hasSession: true,
      profileBound: true,
      isAuthInitialized: true,
    });
    expect(isPostOAuthSplashRequested()).toBe(true);

    tryDismissPostOAuthSplashAfterLanding("/move", {
      hasSession: true,
      profileBound: true,
      isAuthInitialized: true,
    });
    expect(isPostOAuthSplashRequested()).toBe(false);
  });

  it("accepte /onboarding et /identity-verification comme routes finales", () => {
    expect(isPostOAuthFinalLandingPath("/onboarding")).toBe(true);
    expect(isPostOAuthFinalLandingPath("/identity-verification")).toBe(true);
    expect(isPostOAuthFinalLandingPath("/auth")).toBe(false);
  });

  it("abortPostOAuthSplash retire l’overlay (annulation / erreur)", () => {
    beginPostOAuthSplash();
    abortPostOAuthSplash();
    expect(isPostOAuthSplashRequested()).toBe(false);
  });

  it("pas de dismiss prématuré si profil non lié", () => {
    beginPostOAuthSplash();
    tryDismissPostOAuthSplashAfterLanding("/move", {
      hasSession: true,
      profileBound: false,
      isAuthInitialized: true,
    });
    expect(isPostOAuthSplashRequested()).toBe(true);
  });
});
