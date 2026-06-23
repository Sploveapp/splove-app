import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllOAuthSessionLocks,
  isOauthProcessingLocked,
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import {
  beginPostOAuthSplash,
  forceClearPostOAuthSplash,
  isPostOAuthSplashActive,
  isPostOAuthSplashRequested,
} from "./postOAuthSplash";
import { getOAuthUxOverlayEpoch, resetOAuthUxOverlayEpochForTests } from "./oauthUxNotify";
import { isOAuthUxOverlayActive } from "./oauthUxOverlay";
import { releasePostAuthUi } from "./oauthUxRelease";

vi.mock("./googleSignInOverlay", () => ({
  hideGoogleSignInOverlay: vi.fn(),
  isGoogleSignInOverlayMounted: () => false,
}));

describe("releasePostAuthUi", () => {
  beforeEach(() => {
    clearAllOAuthSessionLocks();
    forceClearPostOAuthSplash();
    resetOAuthUxOverlayEpochForTests();
    vi.stubGlobal("window", {
      location: { hash: "#/move" },
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    });
  });

  it("libère verrous, splash et notifie les gates React", () => {
    setOauthProcessingLock();
    beginPostOAuthSplash();
    const epochBefore = getOAuthUxOverlayEpoch();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string") logs.push(args[0]);
      origLog(...args);
    };

    releasePostAuthUi("auth_redirect_move", "/move");

    console.log = origLog;

    expect(isOauthProcessingLocked()).toBe(false);
    expect(isPostOAuthSplashRequested()).toBe(false);
    expect(isPostOAuthSplashActive()).toBe(false);
    expect(getOAuthUxOverlayEpoch()).toBeGreaterThan(epochBefore);
    expect(logs).toContain("POST_AUTH_UI_RELEASE_START");
    expect(logs).toContain("POST_AUTH_UI_RELEASE_DONE");
    expect(logs).toContain("ROUTE_AFTER_AUTH_CONFIRMED");
    expect(window.location.hash).toBe("#/move");
  });

  it("ne bloque pas /move quand la session est active", () => {
    setOauthProcessingLock();
    beginPostOAuthSplash();
    expect(
      isOAuthUxOverlayActive({
        hasSession: true,
        pathname: "/move",
      }),
    ).toBe(false);
  });
});
