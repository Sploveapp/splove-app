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
    expect(finalizeBlock).not.toContain("dismissPostOAuthSplash");
  });

  it("capacitorOAuth utilise isOAuthTechnicalUrl pour l’intercept", () => {
    const source = readSrc("lib/capacitorOAuth.ts");
    expect(source).toContain("isOAuthTechnicalUrl");
    expect(source).toContain("as-web-auth");
  });

  it("PostOAuthSplashGate : dismiss succès via tryDismiss uniquement", () => {
    const source = readSrc("components/PostOAuthSplashGate.tsx");
    expect(source).toContain("tryDismissPostOAuthSplashAfterLanding");
    expect(source).not.toContain("dismissPostOAuthSplash");
  });
});
