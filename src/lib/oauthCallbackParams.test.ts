import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { establishSupabaseSessionFromOAuthCallbackUrl } from "./oauthCallbackParams";

const exchangeCodeForSessionMock = vi.fn();
const logPkceStorageKeysMock = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
      setSession: vi.fn(),
    },
  },
}));

vi.mock("./oauthPkceDiagnostics", () => ({
  logPkceStorageKeys: (...args: unknown[]) => logPkceStorageKeysMock(...args),
}));

vi.mock("./oauthSessionRecoveryDiag", () => ({
  logOAuthSuccess: vi.fn(),
}));

vi.mock("./authRedirect", () => ({
  isNativeOAuthCallbackUrl: (url: string) => url.startsWith("splove://"),
}));

describe("establishSupabaseSessionFromOAuthCallbackUrl — exchange unique", () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
    logPkceStorageKeysMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("échange le code une seule fois", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });

    const result = await establishSupabaseSessionFromOAuthCallbackUrl(
      "splove://auth/callback?code=pkce-code-123",
    );

    expect(result.ok).toBe(true);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("pkce-code-123");
  });

  it("ne retente pas sur erreur réseau", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "The network connection was lost." },
    });

    const result = await establishSupabaseSessionFromOAuthCallbackUrl(
      "splove://auth/callback?code=pkce-code-123",
    );

    expect(result.ok).toBe(false);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
  });
});
