import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldDeferOAuthRedirectUntilSessionLoaded,
  verifyDefinitiveSupabaseSession,
} from "./oauthSessionRecoveryDiag";

const getSessionMock = vi.fn();
const getUserMock = vi.fn();
const releaseOAuthLoadingScreenOnSessionVerifiedMock = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  },
}));

vi.mock("./oauthLoadingScreenRelease", () => ({
  releaseOAuthLoadingScreenOnSessionVerified: (...args: unknown[]) =>
    releaseOAuthLoadingScreenOnSessionVerifiedMock(...args),
}));

describe("oauthSessionRecoveryDiag", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getUserMock.mockReset();
    releaseOAuthLoadingScreenOnSessionVerifiedMock.mockReset();
  });

  it("verifyDefinitiveSupabaseSession ok quand getSession et getUser concordent", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "u1" }, expires_at: 999 } },
      error: null,
    });
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const result = await verifyDefinitiveSupabaseSession("test");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("u1");
    expect(releaseOAuthLoadingScreenOnSessionVerifiedMock).toHaveBeenCalledWith("test");
  });

  it("verifyDefinitiveSupabaseSession échoue si getSession vide", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const result = await verifyDefinitiveSupabaseSession("test");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("getSession_empty");
  });

  it("shouldDeferOAuthRedirectUntilSessionLoaded pour /onboarding sans session", () => {
    expect(
      shouldDeferOAuthRedirectUntilSessionLoaded("/onboarding", {
        ok: false,
        userId: null,
        reason: "getSession_empty",
        getSessionUserId: null,
        getUserUserId: null,
      }),
    ).toBe(true);
    expect(
      shouldDeferOAuthRedirectUntilSessionLoaded("/onboarding", {
        ok: true,
        userId: "u1",
        reason: "session_verified",
        getSessionUserId: "u1",
        getUserUserId: "u1",
      }),
    ).toBe(false);
  });
});
