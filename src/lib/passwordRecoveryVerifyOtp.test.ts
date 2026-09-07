import { describe, expect, it } from "vitest";
import {
  isPasswordRecoveryErrorUrl,
  parsePasswordRecoveryUrl,
  passwordRecoveryInvalidLinkMessage,
} from "./passwordRecoveryVerifyOtp";

describe("passwordRecoveryVerifyOtp", () => {
  it("parsePasswordRecoveryUrl extrait token_hash et type", () => {
    const parsed = parsePasswordRecoveryUrl(
      "splove://auth/reset-password?token_hash=hash123&type=recovery",
    );
    expect(parsed.tokenHash).toBe("hash123");
    expect(parsed.type).toBe("recovery");
  });

  it("isPasswordRecoveryErrorUrl détecte otp_expired", () => {
    expect(
      isPasswordRecoveryErrorUrl(
        "splove://auth/callback?error=access_denied&error_code=otp_expired",
      ),
    ).toBe(true);
  });

  it("passwordRecoveryInvalidLinkMessage pour otp_expired", () => {
    const msg = passwordRecoveryInvalidLinkMessage({
      tokenHash: null,
      type: null,
      error: "access_denied",
      errorCode: "otp_expired",
      errorDescription: null,
    });
    expect(msg).toContain("plus valide");
  });
});
