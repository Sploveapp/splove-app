import { describe, expect, it } from "vitest";
import {
  NATIVE_PASSWORD_RESET_CALLBACK,
  passwordRecoveryHttpsBridgeUrl,
  passwordRecoveryRedirectUrl,
} from "./authRedirect";
import { urlIndicatesPasswordRecovery } from "./passwordRecoveryBootstrap";
import {
  isPasswordRecoveryErrorUrl,
  parsePasswordRecoveryUrl,
} from "./passwordRecoveryVerifyOtp";

describe("passwordRecoveryBootstrap", () => {
  it("urlIndicatesPasswordRecovery détecte splove://auth/reset-password?token_hash", () => {
    const url =
      "splove://auth/reset-password?token_hash=abc123&type=recovery";
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
    expect(parsePasswordRecoveryUrl(url).type).toBe("recovery");
  });

  it("urlIndicatesPasswordRecovery détecte otp_expired", () => {
    const url =
      "splove://auth/callback?error=access_denied&error_code=otp_expired";
    expect(isPasswordRecoveryErrorUrl(url)).toBe(true);
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
  });

  it("urlIndicatesPasswordRecovery détecte token_hash web", () => {
    const url = "https://splove-app.onrender.com?token_hash=abc&type=recovery";
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
  });

  it("urlIndicatesPasswordRecovery ignore OAuth callback sans recovery", () => {
    const url = "https://splove-app.onrender.com#/auth/callback?code=oauth-code";
    expect(urlIndicatesPasswordRecovery(url)).toBe(false);
  });

  it("passwordRecoveryRedirectUrl utilise le pont HTTPS email", () => {
    expect(passwordRecoveryRedirectUrl()).toBe(passwordRecoveryHttpsBridgeUrl());
    expect(passwordRecoveryRedirectUrl()).toMatch(/\/reset-password$/);
  });

  it("NATIVE_PASSWORD_RESET_CALLBACK format attendu", () => {
    expect(NATIVE_PASSWORD_RESET_CALLBACK).toBe("splove://auth/reset-password");
  });
});
