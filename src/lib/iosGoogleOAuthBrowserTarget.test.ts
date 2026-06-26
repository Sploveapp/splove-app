import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureIosBrowserNeverOpensSupabase,
  logIosOAuthBrowserTarget,
  resolveGoogleAuthorizeUrlFromSupabase,
  resolveIosGoogleOAuthBrowserTarget,
} from "./iosGoogleOAuthBrowserTarget";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

const GOOGLE_AUTHORIZE =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fabc.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=openid+email+profile&state=xyz";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: { request: requestMock },
}));

describe("resolveIosGoogleOAuthBrowserTarget", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("suit un 302 Supabase → Google et ouvre accounts.google.com", async () => {
    requestMock.mockResolvedValue({
      status: 302,
      headers: { location: GOOGLE_AUTHORIZE },
      url: SUPABASE_AUTHORIZE,
    });

    const target = await resolveIosGoogleOAuthBrowserTarget(SUPABASE_AUTHORIZE);
    expect(target.strategy).toBe("google_direct");
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: SUPABASE_AUTHORIZE,
        disableRedirects: true,
      }),
    );
    expect(target.url).toBe(GOOGLE_AUTHORIZE);
    expect(target.openHost).toBe("accounts.google.com");
    expect(target.sourceAuthorizeHost).toBe("abc.supabase.co");
    expect(target.googleVisible).toBe(true);
    expect(target.supabaseFlashRisk).toBe(false);
  });

  it("suit une chaîne de 302 intermédiaires jusqu’à Google", async () => {
    const intermediate =
      "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256&hop=2";

    requestMock
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: intermediate },
        url: SUPABASE_AUTHORIZE,
      })
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: GOOGLE_AUTHORIZE },
        url: intermediate,
      });

    const googleUrl = await resolveGoogleAuthorizeUrlFromSupabase(SUPABASE_AUTHORIZE);
    expect(googleUrl).toBe(GOOGLE_AUTHORIZE);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("retombe sur la page SPLove start si la résolution échoue", async () => {
    requestMock.mockRejectedValue(new Error("network"));

    const target = await resolveIosGoogleOAuthBrowserTarget(SUPABASE_AUTHORIZE);
    expect(target.strategy).toBe("splove_start_page");
    expect(target.url).toContain("#/oauth/google/start");
    expect(target.supabaseFlashRisk).toBe(true);
    expect(target.googleVisible).toBe(false);
    expect(target.openHost).toBe("localhost");
  });

  it("ensureIosBrowserNeverOpensSupabase bloque toute URL supabase.co", () => {
    const blocked = ensureIosBrowserNeverOpensSupabase(
      {
        url: SUPABASE_AUTHORIZE,
        strategy: "google_direct",
        sourceAuthorizeHost: "abc.supabase.co",
        openHost: "abc.supabase.co",
        supabaseFlashRisk: false,
        googleVisible: false,
      },
      SUPABASE_AUTHORIZE,
    );
    expect(blocked.strategy).toBe("splove_start_page");
    expect(blocked.url).toContain("#/oauth/google/start");
    expect(blocked.url).not.toContain("supabase.co/auth/v1/authorize");
  });

  it("logIosOAuthBrowserTarget émet les diagnostics iOS attendus", () => {
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push([...args]);
    });

    logIosOAuthBrowserTarget(
      {
        url: GOOGLE_AUTHORIZE,
        strategy: "google_direct",
        sourceAuthorizeHost: "abc.supabase.co",
        openHost: "accounts.google.com",
        supabaseFlashRisk: false,
        googleVisible: true,
      },
      SUPABASE_AUTHORIZE,
    );

    expect(logs.some((row) => row[0] === "IOS_BROWSER_INITIAL_URL" && row[1] === "abc.supabase.co")).toBe(
      true,
    );
    expect(logs.some((row) => row[0] === "IOS_BROWSER_GOOGLE_VISIBLE" && row[1] === true)).toBe(true);
    spy.mockRestore();
  });
});
