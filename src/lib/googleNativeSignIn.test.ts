import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "ios"),
    isNativePlatform: vi.fn(() => true),
  },
}));

vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./env", () => ({
  env: {
    googleIosClientId: "ios-id.apps.googleusercontent.com",
    googleWebClientId: "web-id.apps.googleusercontent.com",
  },
  hasGoogleNativeIosEnv: true,
  hasSupabaseEnv: true,
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      signInWithIdToken: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import {
  initGoogleNativeSignIn,
  isGoogleNativeSignInReady,
  isIosGoogleNativeEnabled,
} from "./googleNativeSignIn";

describe("googleNativeSignIn", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("isIosGoogleNativeEnabled exige le feature flag et iOS natif", () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "false");
    expect(isIosGoogleNativeEnabled()).toBe(false);

    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "true");
    expect(isIosGoogleNativeEnabled()).toBe(true);

    vi.mocked(Capacitor.getPlatform).mockReturnValueOnce("web");
    expect(isIosGoogleNativeEnabled()).toBe(false);
  });

  it("initGoogleNativeSignIn no-op sans feature flag", async () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "false");
    await initGoogleNativeSignIn();
    expect(SocialLogin.initialize).not.toHaveBeenCalled();
    expect(isGoogleNativeSignInReady()).toBe(false);
  });

  it("initGoogleNativeSignIn appelle SocialLogin.initialize quand flag + env OK", async () => {
    vi.stubEnv("VITE_IOS_GOOGLE_NATIVE", "true");

    await initGoogleNativeSignIn();

    expect(SocialLogin.initialize).toHaveBeenCalledWith({
      google: {
        iOSClientId: "ios-id.apps.googleusercontent.com",
        webClientId: "web-id.apps.googleusercontent.com",
        iOSServerClientId: "web-id.apps.googleusercontent.com",
        mode: "online",
      },
    });
    expect(isGoogleNativeSignInReady()).toBe(true);
  });
});
