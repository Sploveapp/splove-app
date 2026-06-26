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

  it("hideIosGoogleOAuthConnectingOverlay masque sur app_url_open", async () => {
    await showIosGoogleOAuthConnectingOverlay();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string") logs.push(args[0]);
      orig(...args);
    };

    hideIosGoogleOAuthConnectingOverlay("app_url_open");

    console.log = orig;

    expect(hideOverlayMock).toHaveBeenCalledWith("app_url_open");
    expect(logs).toContain("IOS_GOOGLE_OAUTH_DISPLAY_HIDE");
  });
});
