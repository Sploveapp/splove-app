import { describe, expect, it, beforeEach } from "vitest";
import { isOAuthUxOverlayActive } from "./oauthUxOverlay";
import { setOauthProcessingLock, clearOauthProcessingLock } from "./oauthCallbackLock";

describe("oauthUxOverlay", () => {
  beforeEach(() => {
    clearOauthProcessingLock();
  });

  it("active pendant le verrou OAuth", () => {
    setOauthProcessingLock();
    expect(isOAuthUxOverlayActive()).toBe(true);
  });
});
