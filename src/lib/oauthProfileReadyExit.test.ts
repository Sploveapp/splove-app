import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllOAuthSessionLocks,
  clearOauthProcessingLock,
  setOauthProcessingLock,
} from "./oauthCallbackLock";
import { beginPostOAuthSplash, forceClearPostOAuthSplash } from "./postOAuthSplash";
import {
  isOAuthUxBlockingAfterProfileReady,
  resolvePostOAuthHashRouteFromProfile,
  resetOAuthProfileReadyExitForTests,
  tryExitOAuthLoadingAfterProfileReady,
} from "./oauthProfileReadyExit";
import { isOAuthUxOverlayActive } from "./oauthUxOverlay";

const forceReleaseOAuthUxMock = vi.hoisted(() => vi.fn());

vi.mock("./authRedirect", () => ({
  isNativeCapacitorApp: () => true,
  isAuthCallbackPath: () => false,
}));

vi.mock("./scrubOAuthUrlFromWindow", () => ({
  scrubOAuthTokensFromNativeWindow: vi.fn(),
}));

vi.mock("./oauthUxRelease", () => ({
  forceReleaseOAuthUx: (...args: unknown[]) => forceReleaseOAuthUxMock(...args),
}));

describe("oauthProfileReadyExit", () => {
  beforeEach(() => {
    clearAllOAuthSessionLocks();
    forceClearPostOAuthSplash();
    resetOAuthProfileReadyExitForTests();
    forceReleaseOAuthUxMock.mockReset();
    forceReleaseOAuthUxMock.mockImplementation(() => {
      clearOauthProcessingLock();
      forceClearPostOAuthSplash();
    });
  });

  it("détecte le blocage OAuth actif (verrou ou splash)", () => {
    expect(isOAuthUxBlockingAfterProfileReady()).toBe(false);
    setOauthProcessingLock();
    expect(isOAuthUxBlockingAfterProfileReady()).toBe(true);
    clearOauthProcessingLock();
    beginPostOAuthSplash();
    expect(isOAuthUxBlockingAfterProfileReady()).toBe(true);
  });

  it("route /move si profil complet pour Move", () => {
    expect(
      resolvePostOAuthHashRouteFromProfile({
        id: "u1",
        profile_completed: true,
      }),
    ).toBe("/move");
  });

  it("route /onboarding si profil incomplet", () => {
    expect(
      resolvePostOAuthHashRouteFromProfile({
        id: "u1",
        profile_completed: false,
        onboarding_completed: false,
      }),
    ).toBe("/onboarding");
  });

  it("libère oauthUx et navigue après profil prêt + session", () => {
    setOauthProcessingLock();
    beginPostOAuthSplash();
    expect(isOAuthUxOverlayActive()).toBe(true);

    const exited = tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u1",
    );

    expect(exited).toBe(true);
    expect(forceReleaseOAuthUxMock).toHaveBeenCalledWith("auth_profile_ready");
    expect(isOAuthUxOverlayActive()).toBe(false);
  });

  it("no-op sans verrou OAuth actif", () => {
    const exited = tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u1",
    );
    expect(exited).toBe(false);
    expect(forceReleaseOAuthUxMock).not.toHaveBeenCalled();
  });

  it("no-op si profil.id !== session user", () => {
    setOauthProcessingLock();
    const exited = tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u2",
    );
    expect(exited).toBe(false);
    expect(isOAuthUxOverlayActive()).toBe(true);
    expect(forceReleaseOAuthUxMock).not.toHaveBeenCalled();
  });
});
