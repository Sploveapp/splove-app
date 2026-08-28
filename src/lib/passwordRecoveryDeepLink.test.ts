import { describe, expect, it } from "vitest";
import {
  isNativePasswordRecoveryUrl,
  NATIVE_OAUTH_CALLBACK,
  passwordRecoveryRedirectUrl,
} from "./authRedirect";
import { isPasswordRecoveryDeepLinkActionable } from "./passwordRecoveryDeepLink";

describe("password recovery redirect", () => {
  it("passwordRecoveryRedirectUrl utilise l’origine publique web", () => {
    const redirect = passwordRecoveryRedirectUrl();
    expect(redirect).toMatch(/^https:\/\//);
    expect(NATIVE_OAUTH_CALLBACK).toBe("splove://auth/callback");
  });

  it("reconnaît splove://auth/callback avec type=recovery", () => {
    const url =
      "splove://auth/callback#access_token=at&refresh_token=rt&type=recovery";
    expect(isPasswordRecoveryDeepLinkActionable(url)).toBe(true);
  });

  it("reconnaît splove://auth/callback?code= sans provider OAuth actif", () => {
    const url = "splove://auth/callback?code=pkce-recovery-code";
    expect(
      isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: false }),
    ).toBe(true);
    expect(
      isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: true }),
    ).toBe(false);
  });

  it("n’interprète pas access_token sans type=recovery comme recovery", () => {
    const url = "splove://auth/callback#access_token=at&refresh_token=rt";
    expect(isPasswordRecoveryDeepLinkActionable(url)).toBe(false);
  });

  it("reconnaît splove://auth/recovery legacy avec tokens", () => {
    const url = "splove://auth/recovery#access_token=at&refresh_token=rt&type=recovery";
    expect(isNativePasswordRecoveryUrl(url)).toBe(true);
    expect(isPasswordRecoveryDeepLinkActionable(url)).toBe(true);
  });

  it("ne confond pas recovery et OAuth callback actif", () => {
    const url = "splove://auth/callback?code=abc";
    expect(
      isPasswordRecoveryDeepLinkActionable(url, { nativeOAuthProviderActive: true }),
    ).toBe(false);
  });
});
