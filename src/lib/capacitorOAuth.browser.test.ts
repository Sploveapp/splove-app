import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertIosBrowserOpenBeforeOpen,
  isIosOAuthBrowserOpenAllowedUrl,
  isOAuthBrowserOpenAllowedUrl,
  resetOAuthBrowserWaitStateForTests,
  routeOAuthDeepLink,
} from "./capacitorOAuth";

const GOOGLE_AUTHORIZE =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fabc.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=openid+email+profile&state=xyz";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

const CALLBACK = "splove://auth/callback?code=oauth-code-123";

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn(),
    close: vi.fn(),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "ios", isNativePlatform: () => true },
}));

vi.mock("./completeNativeOAuthReturn", () => ({
  completeNativeOAuthReturn: vi.fn(async () => true),
}));

vi.mock("./sploveIosGoogleOAuth", () => ({
  isSploveIosGoogleOAuthAvailable: vi.fn(async () => false),
  openSploveIosGoogleOAuthSession: vi.fn(),
}));

describe("capacitorOAuth garde-fous Browser.open iOS", () => {
  beforeEach(() => {
    resetOAuthBrowserWaitStateForTests();
  });

  it("iOS : autorise uniquement accounts.google.com", () => {
    expect(isIosOAuthBrowserOpenAllowedUrl(GOOGLE_AUTHORIZE)).toBe(true);
    expect(isIosOAuthBrowserOpenAllowedUrl(SUPABASE_AUTHORIZE)).toBe(false);
    expect(isIosOAuthBrowserOpenAllowedUrl(CALLBACK)).toBe(false);
  });

  it("Android : autorise Supabase /authorize", () => {
    expect(isOAuthBrowserOpenAllowedUrl(SUPABASE_AUTHORIZE)).toBe(true);
  });

  it("routeOAuthDeepLink traite le callback sans Browser.open", async () => {
    const routed = await routeOAuthDeepLink(CALLBACK);
    expect(routed).toBe(true);
  });

  it("assertIosBrowserOpenBeforeOpen logue url/host/strategy pour Google", () => {
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push([...args]);
    });

    const result = assertIosBrowserOpenBeforeOpen(GOOGLE_AUTHORIZE, "google_direct");
    expect(result.host).toBe("accounts.google.com");
    expect(
      logs.some(
        (row) =>
          row[0] === "BROWSER_OPEN_START" &&
          (row[1] as { url?: string; host?: string; strategy?: string })?.url === GOOGLE_AUTHORIZE &&
          (row[1] as { host?: string })?.host === "accounts.google.com" &&
          (row[1] as { strategy?: string })?.strategy === "google_direct",
      ),
    ).toBe(true);
    spy.mockRestore();
  });

  it("assertIosBrowserOpenBeforeOpen throw si host supabase.co — jamais Browser.open", () => {
    expect(() => assertIosBrowserOpenBeforeOpen(SUPABASE_AUTHORIZE, "google_direct")).toThrow(
      "IOS_BROWSER_OPEN_SUPABASE_FORBIDDEN",
    );
  });
});
