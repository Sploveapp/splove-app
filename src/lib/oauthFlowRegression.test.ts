import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

describe("oauthFlowRegression — garde-fous statiques", () => {
  it("AuthCallback succès : pas de abortPostOAuthSplash dans finalizeOAuthSuccess", () => {
    const source = readSrc("pages/AuthCallback.tsx");
    const finalizeBlock = source.slice(
      source.indexOf("const finalizeOAuthSuccess"),
      source.indexOf("const [debug, setDebug]"),
    );
    expect(finalizeBlock).not.toContain("abortPostOAuthSplash");
    expect(finalizeBlock).toContain("dismissPostOAuthSplash");
    expect(finalizeBlock).toContain("verifyDefinitiveSupabaseSession");
    expect(finalizeBlock).toContain("resolvePostOAuthPath");
  });

  it("capacitorOAuth : flux callback simple sans probes ni resume", () => {
    const source = readSrc("lib/capacitorOAuth.ts");
    expect(source).toContain("handleNativeOAuthCallback");
    expect(source).toContain("BROWSER_CLOSED_ON_CALLBACK");
    expect(source).toContain("APP_URL_OPEN_RECEIVED");
    expect(source).toContain("lastProcessedOAuthCode");
    expect(source).toContain("BROWSER_OPEN_GOOGLE");
    expect(source).not.toContain("probeOAuthReturnUrl");
    expect(source).not.toContain("resumeOAuthFromPersistedSession");
    expect(source).not.toContain("app_state_active");
    expect(source).not.toContain("beginIosOAuthBrowserWait");

    const completeSource = readSrc("lib/completeNativeOAuthReturn.ts");
    expect(completeSource).toContain("SESSION_CONFIRMED");
    expect(completeSource).not.toContain("Browser.close");
  });

  it("oauthCallbackLock : logs verrou callback", () => {
    const source = readSrc("lib/oauthCallbackLock.ts");
    expect(source).toContain("OAUTH_CALLBACK_LOCK_SET");
    expect(source).toContain("OAUTH_CALLBACK_LOCK_CLEAR");
  });

  it("iOS Google OAuth : résolution navigateur Google direct", () => {
    const capSource = readSrc("lib/capacitorOAuth.ts");
    const displaySource = readSrc("lib/iosGoogleOAuthDisplay.ts");
    const iosTargetSource = readSrc("lib/iosGoogleOAuthBrowserTarget.ts");
    expect(displaySource).toContain("showIosGoogleOAuthConnectingOverlay");
    expect(displaySource).toContain("hideIosGoogleOAuthConnectingOverlay");
    expect(capSource).toContain('"ios_native_callback"');
    expect(capSource).toContain("IOS_NATIVE_OAUTH_PLUGIN_OPEN");
    expect(capSource).toContain("resolveIosGoogleOAuthBrowserTarget");
    expect(capSource).not.toContain("openIosGoogleOAuthAuthorize");
    expect(iosTargetSource).toContain("resolveGoogleAuthorizeUrlFromSupabase");
    expect(iosTargetSource).toContain("ensureIosBrowserNeverOpensSupabase");
    expect(iosTargetSource).toContain("disableRedirects: true");
    expect(iosTargetSource).toContain("resolve_failed");
    expect(iosTargetSource).toContain("isIosBrowserOpenAllowed");
    expect(iosTargetSource).not.toContain("splove_start_page");
    expect(iosTargetSource).not.toContain("buildOAuthGoogleStartBrowserUrl");
    expect(capSource).toContain("ensureIosBrowserNeverOpensSupabase");
    expect(capSource).toContain("openIosNativeOAuthSession");
    expect(capSource).toContain("openSploveIosGoogleOAuthSession");
    expect(capSource).toContain("IOS_NATIVE_OAUTH_PLUGIN_OPEN");
    expect(capSource).toContain("openIosOAuthBrowser");
    expect(capSource).toContain("isIosOAuthBrowserOpenAllowedUrl");
    expect(capSource).toContain("IOS_OAUTH_RESOLVE_FAIL");
    expect(capSource).toContain("BROWSER_OPEN_GOOGLE");
    expect(capSource).toContain("routeOAuthDeepLink");
    expect(capSource).toContain("assertIosBrowserOpenBeforeOpen");
    expect(capSource).toContain("BROWSER_OPEN_START");
    expect(capSource).toContain("strategy");
    expect(capSource).toContain("IOS_BROWSER_OPEN_SUPABASE_FORBIDDEN");
    expect(capSource).not.toContain("startIosGoogleOAuthWebAuth");
    expect(capSource).not.toContain("browser_supabase_authorize");

    const androidBlock = capSource.slice(
      capSource.indexOf("const browserTargetUrl = googleOAuthNativeBrowserTargetUrl"),
      capSource.indexOf("return openAndroidOAuthBrowser(browserTargetUrl)"),
    );
    expect(androidBlock).toContain("showGoogleSignInOverlay");
  });

  it("WelcomeSPLove : overlay iOS avant signInWithGoogleOAuth", () => {
    const source = readSrc("pages/WelcomeSPLove.tsx");
    expect(source).toContain("showIosGoogleOAuthConnectingOverlay");
    const fnBlock = source.slice(
      source.indexOf("async function signInWithGoogle"),
      source.indexOf("function goEmailAuth"),
    );
    expect(fnBlock).toContain("showIosGoogleOAuthConnectingOverlay");
    expect(fnBlock).not.toMatch(/navigate\s*\(\s*["'`]\/oauth/);
  });

  it("Auth : overlay iOS avant signInWithGoogleOAuth", () => {
    const source = readSrc("pages/Auth.tsx");
    expect(source).toContain("showIosGoogleOAuthConnectingOverlay");
    const fnBlock = source.slice(
      source.indexOf("async function signInWithGoogle"),
      source.indexOf("const handleAppleComingSoon"),
    );
    expect(fnBlock).toContain("showIosGoogleOAuthConnectingOverlay");
    expect(fnBlock).not.toMatch(/navigate\s*\(\s*["'`]\/oauth/);
  });

  it("postGoogleAuthComplete : logs succès et route", () => {
    const source = readSrc("lib/postGoogleAuthComplete.ts");
    expect(source).toContain("hideIosGoogleOAuthConnectingOverlay");
    expect(source).toContain("GOOGLE_SIGNIN_SUCCESS");
    expect(source).toContain("PROFILE_FETCH_SUCCESS");
    expect(source).toContain("ROUTE_AFTER_AUTH");
  });

  it("PostOAuthSplashGate : dismiss succès via tryDismiss uniquement", () => {
    const source = readSrc("components/PostOAuthSplashGate.tsx");
    expect(source).toContain("tryDismissPostOAuthSplashAfterLanding");
    expect(source).not.toContain("dismissPostOAuthSplash");
  });
});
