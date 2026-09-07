import { describe, expect, it } from "vitest";
import {
  isNativePasswordResetUrl,
  NATIVE_OAUTH_CALLBACK,
  NATIVE_PASSWORD_RESET_CALLBACK,
  passwordRecoveryHttpsBridgeUrl,
} from "./authRedirect";
import { isPasswordRecoveryDeepLinkActionable } from "./passwordRecoveryDeepLink";
import {
  isPasswordRecoveryErrorUrl,
  parsePasswordRecoveryUrl,
} from "./passwordRecoveryVerifyOtp";

describe("password recovery redirect", () => {
  it("passwordRecoveryHttpsBridgeUrl est l’URL email HTTPS", () => {
    expect(passwordRecoveryHttpsBridgeUrl()).toMatch(/^https:\/\//);
    expect(NATIVE_PASSWORD_RESET_CALLBACK).toBe("splove://auth/reset-password");
    expect(NATIVE_OAUTH_CALLBACK).toBe("splove://auth/callback");
  });

  it("reconnaît splove://auth/reset-password?token_hash=&type=recovery", () => {
    const url =
      "splove://auth/reset-password?token_hash=abc123hash&type=recovery";
    expect(isNativePasswordResetUrl(url)).toBe(true);
    expect(isPasswordRecoveryDeepLinkActionable(url)).toBe(true);
    expect(parsePasswordRecoveryUrl(url).tokenHash).toBe("abc123hash");
  });

  it("reconnaît otp_expired sur auth/callback comme recovery error", () => {
    const url =
      "splove://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(isPasswordRecoveryErrorUrl(url)).toBe(true);
    expect(
      isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: false }),
    ).toBe(true);
  });

  it("reconnaît splove://auth/callback avec type=recovery (legacy)", () => {
    const url =
      "splove://auth/callback#access_token=at&refresh_token=rt&type=recovery";
    expect(isPasswordRecoveryDeepLinkActionable(url)).toBe(true);
  });

  it("ne confond pas recovery et OAuth callback actif", () => {
    const url = "splove://auth/callback?code=abc";
    expect(
      isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: true }),
    ).toBe(false);
  });
});
