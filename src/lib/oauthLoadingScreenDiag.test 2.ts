import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectOAuthLoadingScreenBlockers,
  logOAuthLoadingScreenGate,
  resetOAuthLoadingScreenDiagForTests,
} from "./oauthLoadingScreenDiag";
import { releaseOAuthLoadingScreenOnSessionVerified } from "./oauthLoadingScreenRelease";

const releasePostAuthUiMock = vi.hoisted(() => vi.fn());

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

vi.mock("./oauthUxRelease", () => ({
  releasePostAuthUi: (...args: unknown[]) => releasePostAuthUiMock(...args),
}));

describe("oauthLoadingScreenDiag", () => {
  beforeEach(() => {
    resetOAuthLoadingScreenDiagForTests();
    releasePostAuthUiMock.mockReset();
  });

  it("collectOAuthLoadingScreenBlockers liste les verrous actifs", () => {
    expect(collectOAuthLoadingScreenBlockers()).toEqual(["postOAuthSplashRequested"]);
  });

  it("logOAuthLoadingScreenGate émet SHOW + REASON puis HIDE", () => {
    const logs: Array<{ event: string; payload: unknown }> = [];
    const origLog = console.log;
    console.log = (event: string, payload?: unknown) => {
      logs.push({ event, payload });
      origLog(event, payload);
    };

    logOAuthLoadingScreenGate("PostOAuthSplashGate", true, ["awaiting_session"]);
    logOAuthLoadingScreenGate("PostOAuthSplashGate", false, ["session_user_verified"]);

    console.log = origLog;

    expect(logs.map((l) => l.event)).toEqual([
      "OAUTH_LOADING_SCREEN_SHOW",
      "OAUTH_LOADING_SCREEN_REASON",
      "OAUTH_LOADING_SCREEN_HIDE",
    ]);
  });

  it("releaseOAuthLoadingScreenOnSessionVerified libère l’overlay", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string") logs.push(args[0]);
      origLog(...args);
    };

    releaseOAuthLoadingScreenOnSessionVerified("session_user_verified");

    console.log = origLog;

    expect(releasePostAuthUiMock).toHaveBeenCalledWith("session_user_verified");
    expect(logs).toContain("OAUTH_LOADING_SCREEN_HIDE");
  });
});
