import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOAuthBrowserOpenAllowedUrl,
  resetOAuthBrowserWaitStateForTests,
  routeOAuthDeepLink,
} from "./capacitorOAuth";

const GOOGLE_AUTHORIZE =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fabc.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=openid+email+profile&state=xyz";

const SUPABASE_AUTHORIZE =
  "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=splove%3A%2F%2Fauth%2Fcallback";

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

describe("capacitorOAuth garde-fous Browser.open", () => {
  beforeEach(() => {
    resetOAuthBrowserWaitStateForTests();
  });

  it("autorise Google et Supabase /authorize", () => {
    expect(isOAuthBrowserOpenAllowedUrl(GOOGLE_AUTHORIZE)).toBe(true);
    expect(isOAuthBrowserOpenAllowedUrl(SUPABASE_AUTHORIZE)).toBe(true);
  });

  it("refuse splove://auth/callback", () => {
    expect(isOAuthBrowserOpenAllowedUrl(CALLBACK)).toBe(false);
  });

  it("routeOAuthDeepLink traite le callback sans Browser.open", async () => {
    const routed = await routeOAuthDeepLink(CALLBACK);
    expect(routed).toBe(true);
  });
});
