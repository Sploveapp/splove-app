import { describe, expect, it } from "vitest";
import { passwordRecoveryRedirectUrl, getPublicAppOrigin } from "./authRedirect";
import { urlIndicatesPasswordRecovery } from "./passwordRecoveryBootstrap";

describe("passwordRecoveryBootstrap", () => {
  it("passwordRecoveryRedirectUrl pointe vers l’origine publique web (pas splove://)", () => {
    const redirect = passwordRecoveryRedirectUrl();
    expect(redirect).toMatch(/^https:\/\//);
    expect(redirect).not.toMatch(/^splove:\/\//);
    expect(redirect).toBe(getPublicAppOrigin());
  });

  it("urlIndicatesPasswordRecovery détecte #access_token avec type=recovery", () => {
    const url =
      "https://splove-app.onrender.com#access_token=at&refresh_token=rt&type=recovery";
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
  });

  it("urlIndicatesPasswordRecovery détecte ?code= à la racine", () => {
    const url = "https://splove-app.onrender.com/?code=pkce-recovery-code";
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
  });

  it("urlIndicatesPasswordRecovery détecte token_hash", () => {
    const url = "https://splove-app.onrender.com?token_hash=abc&type=recovery";
    expect(urlIndicatesPasswordRecovery(url)).toBe(true);
  });

  it("urlIndicatesPasswordRecovery ignore OAuth callback sans recovery", () => {
    const url = "https://splove-app.onrender.com#/auth/callback?code=oauth-code";
    expect(urlIndicatesPasswordRecovery(url)).toBe(false);
  });
});
