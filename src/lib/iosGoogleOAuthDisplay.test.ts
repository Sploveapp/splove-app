import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hideIosGoogleOAuthConnectingOverlay,
  isIosGoogleOAuthBrowserFlow,
  resetIosGoogleOAuthDisplayForTests,
  showIosGoogleOAuthConnectingOverlay,
} from "./iosGoogleOAuthDisplay";

const getPlatformMock = vi.hoisted(() => vi.fn(() => "ios"));
const isNativePlatformMock = vi.hoisted(() => vi.fn(() => true));
const showOverlayMock = vi.hoisted(() => vi.fn());
const hideOverlayMock = vi.hoisted(() => vi.fn());
const beginSplashMock = vi.hoisted(() => vi.fn());
const isOauthProcessingLockedMock = vi.hoisted(() => vi.fn(() => false));
const isOAuthBrowserOpenMock = vi.hoisted(() => vi.fn(() => false));
const isPostOAuthSplashRequestedMock = vi.hoisted(() => vi.fn(() => false));
const isPostOAuthSplashActiveMock = vi.hoisted(() => vi.fn(() => false));
const windowLocationHasTechnicalOAuthUrlMock = vi.hoisted(() => vi.fn(() => false));
const isMountedMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => getPlatformMock(),
    isNativePlatform: () => isNativePlatformMock(),
  },
}));

vi.mock("./authRedirect", () => ({
  isGoogleOAuthNativePlatform: () => true,
}));

vi.mock("./postOAuthSplash", () => ({
  beginPostOAuthSplash: () => beginSplashMock(),
  isPostOAuthSplashRequested: () => isPostOAuthSplashRequestedMock(),
  isPostOAuthSplashActive: () => isPostOAuthSplashActiveMock(),
}));

vi.mock("./oauthCallbackLock", () => ({
  isOauthProcessingLocked: () => isOauthProcessingLockedMock(),
}));

vi.mock("./oauthBrowserOpenState", () => ({
  isOAuthBrowserOpen: () => isOAuthBrowserOpenMock(),
}));

vi.mock("./oauthVisualMask", () => ({
  logOAuthMaskShow: vi.fn(),
  logOAuthMaskHide: vi.fn(),
  windowLocationHasTechnicalOAuthUrl: () => windowLocationHasTechnicalOAuthUrlMock(),
}));

vi.mock("./sploveIosGoogleOAuth", () => ({
  showSploveIosOAuthConnectingMask: () => Promise.resolve(),
}));

vi.mock("./googleSignInOverlay", () => ({
  showGoogleSignInOverlay: () => showOverlayMock(),
  hideGoogleSignInOverlay: (...args: unknown[]) => hideOverlayMock(...args),
  awaitGoogleSignInOverlayPaint: () => Promise.resolve(),
  isGoogleSignInOverlayMounted: () => isMountedMock(),
}));

describe("iosGoogleOAuthDisplay", () => {
  beforeEach(() => {
    resetIosGoogleOAuthDisplayForTests();
    getPlatformMock.mockReturnValue("ios");
    showOverlayMock.mockReset();
    hideOverlayMock.mockReset();
    beginSplashMock.mockReset();
    isMountedMock.mockReturnValue(false);
    isOauthProcessingLockedMock.mockReturnValue(false);
    isOAuthBrowserOpenMock.mockReturnValue(false);
    isPostOAuthSplashRequestedMock.mockReturnValue(false);
    isPostOAuthSplashActiveMock.mockReturnValue(false);
    windowLocationHasTechnicalOAuthUrlMock.mockReturnValue(false);
  });

  it("isIosGoogleOAuthBrowserFlow true sur iOS natif", () => {
    expect(isIosGoogleOAuthBrowserFlow()).toBe(true);
    getPlatformMock.mockReturnValue("android");
    expect(isIosGoogleOAuthBrowserFlow()).toBe(false);
  });

  it("showIosGoogleOAuthConnectingOverlay affiche l’overlay sans navigation interne", async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string") logs.push(args[0]);
      orig(...args);
    };

    await showIosGoogleOAuthConnectingOverlay();

    console.log = orig;

    expect(beginSplashMock).toHaveBeenCalled();
    expect(showOverlayMock).toHaveBeenCalled();
    expect(logs).toContain("IOS_GOOGLE_OAUTH_DISPLAY_SHOW");
  });

  it("hideIosGoogleOAuthConnectingOverlay diffère sur app_url_open tant que OAuth actif", async () => {
    isOauthProcessingLockedMock.mockReturnValue(true);
    await showIosGoogleOAuthConnectingOverlay();

    hideIosGoogleOAuthConnectingOverlay("app_url_open");

    expect(hideOverlayMock).not.toHaveBeenCalled();
  });

  it("hideIosGoogleOAuthConnectingOverlay masque quand les verrous sont levés", async () => {
    isOauthProcessingLockedMock.mockReturnValue(false);
    await showIosGoogleOAuthConnectingOverlay();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string") logs.push(args[0]);
      orig(...args);
    };

    hideIosGoogleOAuthConnectingOverlay("route_ready");

    console.log = orig;

    expect(hideOverlayMock).toHaveBeenCalledWith("route_ready");
    expect(logs).toContain("IOS_GOOGLE_OAUTH_DISPLAY_HIDE");
  });
});
