import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectOAuthLoadingScreenBlockers,
  shouldShowOAuthLoadingScreen,
  shouldSuppressOAuthLoadingOnMoveRoute,
} from "./oauthLoadingScreenDiag";
import {
  clearOAuthSessionVerifiedLatch,
  markOAuthSessionVerifiedLatch,
  resetOAuthSessionVerifiedLatchForTests,
} from "./oauthSessionVerifiedLatch";

vi.mock("./oauthCallbackLock", () => ({
  isOauthProcessingLocked: () => false,
}));

vi.mock("./postOAuthSplash", () => ({
  isPostOAuthSplashRequested: () => true,
  isPostOAuthSplashActive: () => false,
}));

vi.mock("./googleSignInOverlay", () => ({
  isGoogleSignInOverlayMounted: () => false,
}));

describe("oauthSessionVerifiedLatch", () => {
  beforeEach(() => {
    resetOAuthSessionVerifiedLatchForTests();
  });

  it("shouldShowOAuthLoadingScreen masque dès que le latch est posé", () => {
    expect(shouldShowOAuthLoadingScreen(true, false)).toBe(true);
    markOAuthSessionVerifiedLatch();
    expect(shouldShowOAuthLoadingScreen(true, false)).toBe(false);
  });

  it("shouldShowOAuthLoadingScreen masque quand AuthContext a la session", () => {
    expect(shouldShowOAuthLoadingScreen(true, true)).toBe(false);
  });

  it("shouldSuppressOAuthLoadingOnMoveRoute sur /move avec latch", () => {
    markOAuthSessionVerifiedLatch();
    expect(
      shouldSuppressOAuthLoadingOnMoveRoute("/move", "#/move", false),
    ).toBe(true);
    clearOAuthSessionVerifiedLatch();
    expect(
      shouldSuppressOAuthLoadingOnMoveRoute("/move", "#/move", true),
    ).toBe(true);
    expect(
      shouldSuppressOAuthLoadingOnMoveRoute("/auth", "#/auth", false),
    ).toBe(false);
  });

  it("collectOAuthLoadingScreenBlockers liste postOAuthSplashRequested", () => {
    expect(collectOAuthLoadingScreenBlockers()).toEqual(["postOAuthSplashRequested"]);
  });
});
