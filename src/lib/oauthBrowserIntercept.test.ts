import { describe, expect, it } from "vitest";
import {
  isGoogleOAuthProviderUrl,
  isOAuthTechnicalUrl,
  isSupabaseOAuthInterceptUrl,
} from "./oauthBrowserIntercept";

describe("isOAuthTechnicalUrl — non-régression visuelle OAuth", () => {
  it("détecte les URLs Supabase callback (ne doivent pas rester visibles)", () => {
    expect(
      isOAuthTechnicalUrl("https://abcdefgh.supabase.co/auth/v1/callback?code=xyz"),
    ).toBe(true);
    expect(isOAuthTechnicalUrl("https://project.supabase.co/auth/v1/authorize")).toBe(true);
  });

  it("détecte access_token, refresh_token et code= hors Google", () => {
    expect(isOAuthTechnicalUrl("https://example.com/cb#access_token=abc&refresh_token=def")).toBe(
      true,
    );
    expect(isOAuthTechnicalUrl("https://example.com/oauth?code=pkce123")).toBe(true);
  });

  it("n’intercepte pas accounts.google.com (visible, normal)", () => {
    expect(
      isGoogleOAuthProviderUrl(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=xyz",
      ),
    ).toBe(true);
    expect(
      isOAuthTechnicalUrl(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=xyz",
      ),
    ).toBe(false);
  });

  it("n’intercepte pas le deep link splove:// (routé par appUrlOpen)", () => {
    expect(
      isOAuthTechnicalUrl("splove://auth/callback#access_token=jwt&refresh_token=rt"),
    ).toBe(false);
  });

  it("alias isSupabaseOAuthInterceptUrl === isOAuthTechnicalUrl", () => {
    const url = "https://x.supabase.co/auth/v1/callback";
    expect(isSupabaseOAuthInterceptUrl(url)).toBe(isOAuthTechnicalUrl(url));
  });

  it("rejette les entrées vides", () => {
    expect(isOAuthTechnicalUrl(null)).toBe(false);
    expect(isOAuthTechnicalUrl("")).toBe(false);
    expect(isOAuthTechnicalUrl("   ")).toBe(false);
  });
});
