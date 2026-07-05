import { beforeEach, describe, expect, it } from "vitest";
import { isOAuthUxOverlayActive } from "./oauthUxOverlay";
import {
  clearAllOAuthSessionLocks,
  isOauthProcessingLocked,
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import { beginPostOAuthSplash, forceClearPostOAuthSplash } from "./postOAuthSplash";
import { releasePostAuthUi } from "./oauthUxRelease";

describe("oauthUxOverlay", () => {
  beforeEach(() => {
    clearAllOAuthSessionLocks();
    forceClearPostOAuthSplash();
  });

  it("active pendant le verrou OAuth", () => {
    setOauthProcessingLock();
    expect(isOAuthUxOverlayActive()).toBe(true);
  });

  it("inactive sur /move avec session uniquement quand plus aucun verrou ni URL technique", () => {
    expect(
      isOAuthUxOverlayActive({
        hasSession: true,
        pathname: "/move",
        hash: "#/move",
      }),
    ).toBe(false);
  });

  it("reste active sur /move avec session si verrou OAuth encore actif", () => {
    setOauthProcessingLock();
    beginPostOAuthSplash();
    expect(
      isOAuthUxOverlayActive({
        hasSession: true,
        pathname: "/move",
        hash: "#/move",
      }),
    ).toBe(true);
  });

  it("redevient inactive après releasePostAuthUi", () => {
    setOauthProcessingLock();
    releasePostAuthUi("test_release");
    expect(isOauthProcessingLocked()).toBe(false);
    expect(isOAuthUxOverlayActive()).toBe(false);
  });
});
