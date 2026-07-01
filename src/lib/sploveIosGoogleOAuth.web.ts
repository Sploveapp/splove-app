import type { SploveIosGoogleOAuthPlugin } from "./sploveIosGoogleOAuth";

export class SploveIosGoogleOAuthWeb implements SploveIosGoogleOAuthPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async openGoogleOAuth(): Promise<{ outcome: "canceled" }> {
    return { outcome: "canceled" };
  }

  async showFinalizingMask(): Promise<void> {
    /* web no-op */
  }

  async hideOAuthMask(): Promise<void> {
    /* web no-op */
  }
}
