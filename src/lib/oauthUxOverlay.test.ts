import { describe, expect, it, beforeEach } from "vitest";
import { isOAuthUxOverlayActive } from "./oauthUxOverlay";
import {
  clearAllOAuthSessionLocks,
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import { forceClearPostOAuthSplash } from "./postOAuthSplash";

describe("oauthUxOverlay", () => {
  beforeEach(() => {
    clearAllOAuthSessionLocks();
    forceClearPostOAuthSplash();
  });

  it("active pendant le verrou OAuth", () => {
    setOauthProcessingLock();
    expect(isOAuthUxOverlayActive()).toBe(true);
  });
});
