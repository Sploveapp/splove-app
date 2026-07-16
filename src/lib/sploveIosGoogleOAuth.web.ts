import type {
  SploveIosAppleNativeSignInResult,
  SploveIosGoogleOAuthPlugin,
} from "./sploveIosGoogleOAuth";

export class SploveIosGoogleOAuthWeb implements SploveIosGoogleOAuthPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async openGoogleOAuth(): Promise<{ outcome: "canceled" }> {
    return { outcome: "canceled" };
  }

  async signInWithApple(): Promise<SploveIosAppleNativeSignInResult> {
    throw new Error("apple_native_unavailable_on_web");
  }

  async showConnectingMask(): Promise<void> {
    /* web no-op */
  }

  async showFinalizingMask(): Promise<void> {
    /* web no-op */
  }

  async hideOAuthMask(): Promise<void> {
    /* web no-op */
  }
}
