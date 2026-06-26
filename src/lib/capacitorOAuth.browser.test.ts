import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OAUTH_BROWSER_TIMEOUT_USER_MSG,
  resetOAuthBrowserWaitStateForTests,
  subscribeGoogleOAuthBrowserTimeout,
} from "./capacitorOAuth";

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
  completeNativeOAuthReturn: vi.fn(),
}));

vi.mock("./postGoogleAuthComplete", () => ({
  completePostGoogleAuth: vi.fn(),
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

vi.mock("./iosGoogleOAuthBrowserTarget", () => ({
  resolveIosGoogleOAuthBrowserTarget: vi.fn(async () => ({
    url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=y&response_type=code&scope=openid&state=z",
    strategy: "google_direct",
    sourceAuthorizeHost: "abc.supabase.co",
    openHost: "accounts.google.com",
    supabaseFlashRisk: false,
    googleVisible: true,
  })),
  ensureIosBrowserNeverOpensSupabase: vi.fn((target: { url: string }) => target),
}));

describe("capacitorOAuth flux simple", () => {
  beforeEach(() => {
    resetOAuthBrowserWaitStateForTests();
  });

  it("expose le message utilisateur erreur", () => {
    expect(OAUTH_BROWSER_TIMEOUT_USER_MSG).toBe("Connexion interrompue, réessaie");
  });

  it("subscribeGoogleOAuthBrowserTimeout est un no-op", () => {
    const unsub = subscribeGoogleOAuthBrowserTimeout(() => undefined);
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
