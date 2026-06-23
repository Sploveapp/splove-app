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
const verifyDefinitiveSupabaseSessionMock = vi.hoisted(() => vi.fn());

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

vi.mock("./oauthSessionRecoveryDiag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./oauthSessionRecoveryDiag")>();
  return {
    ...actual,
    verifyDefinitiveSupabaseSession: (...args: unknown[]) =>
      verifyDefinitiveSupabaseSessionMock(...args),
  };
});

describe("oauthProfileReadyExit", () => {
  beforeEach(() => {
    clearAllOAuthSessionLocks();
    forceClearPostOAuthSplash();
    resetOAuthProfileReadyExitForTests();
    forceReleaseOAuthUxMock.mockReset();
    verifyDefinitiveSupabaseSessionMock.mockReset();
    forceReleaseOAuthUxMock.mockImplementation(() => {
      clearOauthProcessingLock();
      forceClearPostOAuthSplash();
    });
    verifyDefinitiveSupabaseSessionMock.mockResolvedValue({
      ok: true,
      userId: "u1",
      reason: "session_verified",
      getSessionUserId: "u1",
      getUserUserId: "u1",
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

  it("libère oauthUx et navigue après profil prêt + session vérifiée", async () => {
    setOauthProcessingLock();
    beginPostOAuthSplash();
    expect(isOAuthUxOverlayActive()).toBe(true);

    const exited = await tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u1",
    );

    expect(exited).toBe(true);
    expect(verifyDefinitiveSupabaseSessionMock).toHaveBeenCalledWith("profile_ready_exit");
    expect(forceReleaseOAuthUxMock).toHaveBeenCalledWith("auth_redirect_move", "/move");
    expect(isOAuthUxOverlayActive()).toBe(false);
  });

  it("no-op sans verrou OAuth actif", async () => {
    const exited = await tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u1",
    );
    expect(exited).toBe(false);
    expect(forceReleaseOAuthUxMock).not.toHaveBeenCalled();
  });

  it("no-op si session non vérifiée (pas de redirect /onboarding)", async () => {
    setOauthProcessingLock();
    verifyDefinitiveSupabaseSessionMock.mockResolvedValue({
      ok: false,
      userId: null,
      reason: "getSession_empty",
      getSessionUserId: null,
      getUserUserId: null,
    });

    const exited = await tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: false },
      "u1",
    );

    expect(exited).toBe(false);
    expect(isOAuthUxOverlayActive()).toBe(true);
    expect(forceReleaseOAuthUxMock).not.toHaveBeenCalled();
  });

  it("finalise l’UI sur /move même si les verrous OAuth sont déjà libérés", async () => {
    vi.stubGlobal("window", {
      location: { hash: "#/move" },
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    });
    forceClearPostOAuthSplash();
    clearOauthProcessingLock();
    beginPostOAuthSplash();

    const exited = await tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u1",
    );

    expect(exited).toBe(true);
    expect(forceReleaseOAuthUxMock).toHaveBeenCalledWith("auth_redirect_move", "/move");
  });

  it("no-op si profil.id !== session user", async () => {
    setOauthProcessingLock();
    const exited = await tryExitOAuthLoadingAfterProfileReady(
      { id: "u1", profile_completed: true },
      "u2",
    );
    expect(exited).toBe(false);
    expect(isOAuthUxOverlayActive()).toBe(true);
    expect(forceReleaseOAuthUxMock).not.toHaveBeenCalled();
  });
});
