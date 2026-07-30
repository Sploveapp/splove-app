import { beforeEach, describe, expect, it, vi } from "vitest";
import { Browser } from "@capacitor/browser";
import { resetOAuthBrowserWaitStateForTests, signInWithGoogleOAuth } from "./capacitorOAuth";

const signInNativeAndroidMock = vi.hoisted(() =>
  vi.fn(async () => ({ error: null as Error | null })),
);
const isAndroidNativeMock = vi.hoisted(() => vi.fn(() => true));

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
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(async () => {
        throw new Error("signInWithOAuth must not run on Android Google button");
      }),
      getSession: vi.fn(),
      signInWithIdToken: vi.fn(),
    },
  },
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
    isNativeCapacitorApp: () => true,
  };
});

vi.mock("./oauthPkceDiagnostics", () => ({
  logPkceStorageKeys: vi.fn(),
}));

vi.mock("./sploveIosGoogleOAuth", () => ({
  isSploveIosGoogleOAuthAvailable: vi.fn(async () => false),
  openSploveIosGoogleOAuthSession: vi.fn(),
  signInWithAppleNative: vi.fn(),
}));

vi.mock("./env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env")>();
  return {
    ...actual,
    hasGoogleNativeAndroidEnv: true,
  };
});

vi.mock("./googleNativeSignIn", () => ({
  isAndroidGoogleNativeEnabled: () => isAndroidNativeMock(),
  signInWithGoogleNativeAndroid: () => signInNativeAndroidMock(),
}));

describe("signInWithGoogleOAuth Android — Google Sign-In natif only", () => {
  beforeEach(() => {
    resetOAuthBrowserWaitStateForTests();
    isAndroidNativeMock.mockReturnValue(true);
    signInNativeAndroidMock.mockReset();
    signInNativeAndroidMock.mockResolvedValue({ error: null });
    vi.mocked(Browser.open).mockReset();
  });

  it("utilise le login natif et n’ouvre jamais Browser.open", async () => {
    const { error } = await signInWithGoogleOAuth();

    expect(error).toBeNull();
    expect(signInNativeAndroidMock).toHaveBeenCalledTimes(1);
    expect(Browser.open).not.toHaveBeenCalled();
  });

  it("en cas d’échec natif : erreur claire, pas de Custom Tab", async () => {
    signInNativeAndroidMock.mockResolvedValue({
      error: new Error("SocialLogin.initialize a échoué. code=10"),
    });

    const { error } = await signInWithGoogleOAuth();

    expect(error?.message).toMatch(/SocialLogin|échoué|10/i);
    expect(Browser.open).not.toHaveBeenCalled();
  });
});
