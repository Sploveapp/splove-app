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

const postOAuthSplashRequestedMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("./oauthCallbackLock", () => ({
  isOauthProcessingLocked: () => false,
}));

vi.mock("./oauthBrowserOpenState", () => ({
  isOAuthBrowserOpen: () => false,
}));

vi.mock("./postOAuthSplash", () => ({
  isPostOAuthSplashRequested: () => postOAuthSplashRequestedMock(),
  isPostOAuthSplashActive: () => false,
}));

vi.mock("./googleSignInOverlay", () => ({
  isGoogleSignInOverlayMounted: () => false,
}));

describe("oauthSessionVerifiedLatch", () => {
  beforeEach(() => {
    resetOAuthSessionVerifiedLatchForTests();
    postOAuthSplashRequestedMock.mockReturnValue(false);
  });

  it("shouldShowOAuthLoadingScreen masque dès que le latch est posé", () => {
    expect(shouldShowOAuthLoadingScreen(true, false)).toBe(true);
    markOAuthSessionVerifiedLatch();
    expect(shouldShowOAuthLoadingScreen(true, false)).toBe(false);
  });

  it("shouldShowOAuthLoadingScreen reste actif tant que le masque visuel est requis", () => {
    postOAuthSplashRequestedMock.mockReturnValue(true);
    expect(shouldShowOAuthLoadingScreen(false, true)).toBe(true);
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
    postOAuthSplashRequestedMock.mockReturnValue(true);
    expect(collectOAuthLoadingScreenBlockers()).toEqual(["postOAuthSplashRequested"]);
  });
});
