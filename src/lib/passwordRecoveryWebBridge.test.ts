import { describe, expect, it } from "vitest";
import {
  buildNativePasswordRecoveryDeepLink,
  isWebPasswordRecoveryBridgePage,
} from "./passwordRecoveryWebBridge";
import { passwordRecoveryHttpsBridgeUrl } from "./authRedirect";

describe("passwordRecoveryWebBridge", () => {
  it("passwordRecoveryHttpsBridgeUrl pointe vers /reset-password HTTPS", () => {
    expect(passwordRecoveryHttpsBridgeUrl()).toMatch(
      /^https:\/\/splove-app\.onrender\.com\/reset-password$/,
    );
  });

  it("isWebPasswordRecoveryBridgePage détecte l’URL email Gmail", () => {
    const url =
      "https://splove-app.onrender.com/reset-password?token_hash=abc123&type=recovery";
    expect(isWebPasswordRecoveryBridgePage(url)).toBe(true);
  });

  it("buildNativePasswordRecoveryDeepLink préserve token_hash", () => {
    const link = buildNativePasswordRecoveryDeepLink("hash456", "recovery");
    expect(link).toBe(
      "splove://auth/reset-password?token_hash=hash456&type=recovery",
    );
  });

  it("isWebPasswordRecoveryBridgePage false sans token_hash", () => {
    expect(
      isWebPasswordRecoveryBridgePage("https://splove-app.onrender.com/reset-password"),
    ).toBe(false);
  });
});
