import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

describe("Apple native SIWA — garde-fous", () => {
  it("iOS native : signInWithIdToken + pas d’ASWebAuthenticationSession Apple", () => {
    const cap = readSrc("lib/capacitorOAuth.ts");
    const plugin = readSrc("lib/sploveIosGoogleOAuth.ts");

    expect(cap).toContain("signInWithAppleNativeIos");
    expect(cap).toContain('provider: "apple"');
    expect(cap).toContain("signInWithIdToken");
    expect(cap).toContain("nonce: rawNonce");
    expect(cap).toContain("[APPLE_NATIVE] supabase_exchange_start");
    expect(cap).toContain("[APPLE_NATIVE] session_ready");
    expect(cap).toContain("[APPLE_NATIVE] profile_photo_audit");
    expect(cap).toContain("[APPLE_NATIVE] route_onboarding");
    expect(cap).toContain("prefillAppleNativeFirstNameIfEmpty");
    expect(cap).toContain('completePostGoogleAuth(userId, "apple_native_ios")');

    const onboarding = readSrc("pages/Onboarding.tsx");
    expect(onboarding).toContain('searchParams.get("focus") !== "photos"');
    expect(onboarding).toContain("setStep(9)");

    // iOS ne doit plus ouvrir Browser / OAuth authorize pour Apple
    const iosFn = cap.slice(
      cap.indexOf("async function signInWithAppleNativeIos"),
      cap.indexOf("async function signInWithAppleOAuthAndroid"),
    );
    expect(iosFn).not.toContain("signInWithOAuth");
    expect(iosFn).not.toContain("Browser.open");
    expect(iosFn).not.toContain("NATIVE_OAUTH_CALLBACK");

    expect(plugin).toContain("signInWithApple");
    expect(plugin).toContain("identityToken");
    expect(plugin).toContain("rawNonce");
    expect(plugin).not.toContain("openAppleOAuth");
  });

  it("web conserve signInWithOAuth Apple", () => {
    const cap = readSrc("lib/capacitorOAuth.ts");
    const webFn = cap.slice(
      cap.indexOf("export async function signInWithAppleOAuth"),
      cap.indexOf("function failIosGoogleOAuthResolve"),
    );
    expect(webFn).toContain('provider: "apple"');
    expect(webFn).toContain("signInWithOAuth");
    expect(webFn).toContain("window.location.assign");
  });

  it("plugin Swift natif Apple ID + Google ASWebAuth inchangé", () => {
    const swift = readFileSync(
      join(srcRoot, "..", "ios/App/App/SploveIosGoogleOAuthPlugin.swift"),
      "utf8",
    );
    expect(swift).toContain("ASAuthorizationAppleIDProvider");
    expect(swift).toContain("ASAuthorizationController");
    expect(swift).toContain("requestedScopes = [.fullName, .email]");
    expect(swift).toContain("request.nonce = hashedNonce");
    expect(swift).toContain("[APPLE_NATIVE] authorization_start");
    expect(swift).toContain("[APPLE_NATIVE] identity_token_ready");
    expect(swift).toContain("func openGoogleOAuth");
    expect(swift).toContain("ASWebAuthenticationSession");
    expect(swift).not.toContain("openAppleOAuth");
    expect(swift).not.toContain("appleAuthSession");
  });
});
