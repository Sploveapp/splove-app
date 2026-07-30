import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPlatformMock = vi.hoisted(() => vi.fn(() => "ios"));
const isNativePlatformMock = vi.hoisted(() => vi.fn(() => true));
const initializeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const loginMock = vi.hoisted(() => vi.fn());
const signInWithIdTokenMock = vi.hoisted(() => vi.fn());
const completePostGoogleAuthMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const requestAuthSessionSyncMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => getPlatformMock(),
    isNativePlatform: () => isNativePlatformMock(),
  },
}));

vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
  },
}));

vi.mock("./env", () => ({
  env: {
    googleIosClientId: "ios-id.apps.googleusercontent.com",
    googleWebClientId: "web-id.apps.googleusercontent.com",
  },
  hasGoogleNativeIosEnv: true,
  hasGoogleNativeAndroidEnv: true,
  hasSupabaseEnv: true,
}));

vi.mock("./authRedirect", () => ({
  isNativeCapacitorApp: () => true,
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => signInWithIdTokenMock(...args),
      getSession: vi.fn(),
    },
  },
}));

vi.mock("./postGoogleAuthComplete", () => ({
  abortGoogleSignInFlow: vi.fn(),
  completePostGoogleAuth: (...args: unknown[]) => completePostGoogleAuthMock(...args),
}));

vi.mock("./authSessionSyncBridge", () => ({
  requestAuthSessionSync: () => requestAuthSessionSyncMock(),
}));

vi.mock("./oauthCallbackLock", () => ({
  clearOauthProcessingLock: vi.fn(),
}));

vi.mock("./scrubOAuthUrlFromWindow", () => ({
  scrubOAuthTokensFromNativeWindow: vi.fn(),
}));

vi.mock("./googleOAuthFlow", () => ({
  GOOGLE_OAUTH_USER_ERROR_MSG: "Connexion Google impossible. Réessaie.",
}));

import {
  initGoogleNativeSignIn,
  isAndroidGoogleNativeEnabled,
  isGoogleNativeSignInReady,
  isIosGoogleNativeEnabled,
  resetGoogleNativeSignInForTests,
  signInWithGoogleNativeAndroid,
} from "./googleNativeSignIn";

describe("googleNativeSignIn", () => {
  beforeEach(() => {
    resetGoogleNativeSignInForTests();
    getPlatformMock.mockReturnValue("ios");
    isNativePlatformMock.mockReturnValue(true);
    initializeMock.mockClear();
    loginMock.mockClear();
    signInWithIdTokenMock.mockClear();
    completePostGoogleAuthMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isIosGoogleNativeEnabled exige le feature flag et iOS natif", () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "false");
    expect(isIosGoogleNativeEnabled()).toBe(false);

    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "true");
    expect(isIosGoogleNativeEnabled()).toBe(true);

    getPlatformMock.mockReturnValueOnce("web");
    expect(isIosGoogleNativeEnabled()).toBe(false);
  });

  it("isAndroidGoogleNativeEnabled sur Android natif uniquement", () => {
    getPlatformMock.mockReturnValue("android");
    expect(isAndroidGoogleNativeEnabled()).toBe(true);
    getPlatformMock.mockReturnValue("ios");
    expect(isAndroidGoogleNativeEnabled()).toBe(false);
  });

  it("initGoogleNativeSignIn no-op sans feature flag iOS", async () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "false");
    getPlatformMock.mockReturnValue("ios");
    await initGoogleNativeSignIn();
    expect(initializeMock).not.toHaveBeenCalled();
    expect(isGoogleNativeSignInReady()).toBe(false);
  });

  it("initGoogleNativeSignIn iOS appelle SocialLogin.initialize quand flag + env OK", async () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "true");
    getPlatformMock.mockReturnValue("ios");

    await initGoogleNativeSignIn();

    expect(initializeMock).toHaveBeenCalledWith({
      google: {
        iOSClientId: "ios-id.apps.googleusercontent.com",
        webClientId: "web-id.apps.googleusercontent.com",
        iOSServerClientId: "web-id.apps.googleusercontent.com",
        mode: "online",
      },
    });
    expect(isGoogleNativeSignInReady()).toBe(true);
  });

  it("initGoogleNativeSignIn Android initialise avec webClientId uniquement", async () => {
    getPlatformMock.mockReturnValue("android");
    isNativePlatformMock.mockReturnValue(true);
    expect(isAndroidGoogleNativeEnabled()).toBe(true);

    await initGoogleNativeSignIn();

    expect(initializeMock).toHaveBeenCalledWith({
      google: {
        webClientId: "web-id.apps.googleusercontent.com",
        mode: "online",
      },
    });
    expect(isGoogleNativeSignInReady()).toBe(true);
  });

  it("signInWithGoogleNativeAndroid : idToken → signInWithIdToken → post-auth", async () => {
    getPlatformMock.mockReturnValue("android");
    loginMock.mockResolvedValue({
      provider: "google",
      result: {
        responseType: "online",
        idToken: "fake-google-id-token",
        accessToken: null,
        profile: { email: "a@b.c" },
      },
    });
    signInWithIdTokenMock.mockResolvedValue({
      data: { session: { user: { id: "user-android-1" } } },
      error: null,
    });

    const { error } = await signInWithGoogleNativeAndroid();

    expect(error).toBeNull();
    expect(signInWithIdTokenMock).toHaveBeenCalledWith({
      provider: "google",
      token: "fake-google-id-token",
    });
    expect(completePostGoogleAuthMock).toHaveBeenCalledWith(
      "user-android-1",
      "google_native_android",
    );
  });

  it("signInWithGoogleNativeAndroid : annulation utilisateur", async () => {
    getPlatformMock.mockReturnValue("android");
    initializeMock.mockResolvedValue(undefined);
    loginMock.mockRejectedValue({ code: "USER_CANCELLED", message: "cancelled" });

    // Pré-init pour passer isGoogleNativeSignInReady
    await initGoogleNativeSignIn();
    const { error } = await signInWithGoogleNativeAndroid();

    expect(error).not.toBeNull();
    expect(signInWithIdTokenMock).not.toHaveBeenCalled();
  });
});
