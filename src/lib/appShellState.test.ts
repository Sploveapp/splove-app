import { describe, expect, it } from "vitest";
import { resolveAppShellState } from "./appShellState";

describe("resolveAppShellState", () => {
  it("authResolved false tant que session bootstrap", () => {
    expect(
      resolveAppShellState({
        isAuthInitialized: false,
        isLoading: true,
        sessionUserId: null,
        profileId: null,
      }).authResolved,
    ).toBe(false);
  });

  it("profileResolved quand profil.id === user.id", () => {
    const shell = resolveAppShellState({
      isAuthInitialized: true,
      isLoading: false,
      sessionUserId: "u1",
      profileId: "u1",
    });
    expect(shell.profileResolved).toBe(true);
    expect(shell.appReady).toBe(true);
  });

  it("appReady avec session mais profil absent → false", () => {
    const shell = resolveAppShellState({
      isAuthInitialized: true,
      isLoading: false,
      sessionUserId: "u1",
      profileId: null,
    });
    expect(shell.authResolved).toBe(true);
    expect(shell.profileResolved).toBe(false);
    expect(shell.appReady).toBe(false);
  });
});
