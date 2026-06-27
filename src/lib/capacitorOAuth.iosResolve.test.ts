import { beforeEach, describe, expect, it, vi } from "vitest";
import { Browser } from "@capacitor/browser";
import { resetOAuthBrowserWaitStateForTests, signInWithGoogleOAuth } from "./capacitorOAuth";
import { supabase } from "./supabase";
import { OAUTH_CALLBACK_INTERRUPTED_MSG } from "./googleOAuthFlow";

const GOOGLE_AUTHORIZE =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fabc.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=openid+email+profile&state=xyz";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback&code_challenge=xyz&code_challenge_method=s256";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

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
  CapacitorHttp: { request: (...args: unknown[]) => requestMock(...args) },
}));

vi.mock("./env", () => ({
  env: { supabaseAnonKey: "test-anon-key" },
}));

vi.mock("./supabase", () => ({
  supabase: { auth: { signInWithOAuth: vi.fn(), getSession: vi.fn() } },
}));

vi.mock("./completeNativeOAuthReturn", () => ({
  completeNativeOAuthReturn: vi.fn(async () => true),
}));

vi.mock("./oauthUxRelease", () => ({
  forceReleaseOAuthUx: vi.fn(),
}));

vi.mock("./googleSignInOverlay", () => ({
  showGoogleSignInOverlay: vi.fn(),
  hideGoogleSignInOverlay: vi.fn(),
  awaitGoogleSignInOverlayPaint: vi.fn(),
  logGoogleSignInBrowserOpen: vi.fn(),
}));

vi.mock("./iosGoogleOAuthDisplay", () => ({
  hideIosGoogleOAuthConnectingOverlay: vi.fn(),
}));

vi.mock("./authOAuthUserMessage", () => ({
  stashAuthOAuthUserMessage: vi.fn(),
}));

vi.mock("./authRedirect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./authRedirect")>();
  return {
    ...actual,
    isGoogleOAuthNativePlatform: () => true,
  };
});

vi.mock("./oauthPkceDiagnostics", () => ({
  logPkceStorageKeys: vi.fn(),
}));

describe("signInWithGoogleOAuth iOS — résolution CapacitorHttp réelle (sans mock resolve)", () => {
  beforeEach(() => {
    resetOAuthBrowserWaitStateForTests();
    requestMock.mockReset();
    vi.mocked(Browser.open).mockReset();
    vi.mocked(Browser.open).mockResolvedValue(undefined);
    vi.mocked(supabase.auth.signInWithOAuth).mockReset();
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: "google", url: SUPABASE_AUTHORIZE },
      error: null,
    } as never);
  });

  it("302 Supabase → Google : Browser.open reçoit l’URL Google dérivée du HTTP", async () => {
    requestMock.mockResolvedValueOnce({
      status: 302,
      headers: { location: GOOGLE_AUTHORIZE },
      url: SUPABASE_AUTHORIZE,
    });

    const { error } = await signInWithGoogleOAuth();

    expect(error).toBeNull();
    expect(Browser.open).toHaveBeenCalledTimes(1);
    const openedUrl = String(vi.mocked(Browser.open).mock.calls[0]?.[0]?.url ?? "");
    expect(openedUrl).toContain("accounts.google.com");
    expect(openedUrl).not.toMatch(/supabase\.co\/auth\/v1\/authorize/);
    expect(openedUrl).toBe(GOOGLE_AUTHORIZE);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: SUPABASE_AUTHORIZE,
        disableRedirects: true,
      }),
    );
  });

  it("200 sans Location : pas de Browser.open, erreur Connexion interrompue", async () => {
    requestMock.mockResolvedValue({
      status: 200,
      headers: {},
      url: SUPABASE_AUTHORIZE,
    });

    const { error } = await signInWithGoogleOAuth();

    expect(Browser.open).not.toHaveBeenCalled();
    expect(error?.message).toBe(OAUTH_CALLBACK_INTERRUPTED_MSG);
  });

  it("résolution OK mais URL Supabase passée par erreur : pas de Browser.open", async () => {
    requestMock.mockResolvedValueOnce({
      status: 302,
      headers: { location: GOOGLE_AUTHORIZE },
      url: SUPABASE_AUTHORIZE,
    });

    const iosTargetModule = await import("./iosGoogleOAuthBrowserTarget");
    const ensureSpy = vi
      .spyOn(iosTargetModule, "ensureIosBrowserNeverOpensSupabase")
      .mockReturnValue({
        url: SUPABASE_AUTHORIZE,
        strategy: "google_direct",
        sourceAuthorizeHost: "abc.supabase.co",
        openHost: "abc.supabase.co",
        googleVisible: false,
      });

    const { error } = await signInWithGoogleOAuth();

    expect(Browser.open).not.toHaveBeenCalled();
    expect(error?.message).toBe(OAUTH_CALLBACK_INTERRUPTED_MSG);
    ensureSpy.mockRestore();
  });
});
