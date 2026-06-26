import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

describe("stabilityLocks — OAuth routing", () => {
  it("postGoogleAuthComplete route via resolvePostOAuthPath vers /move ou /onboarding", () => {
    const source = readSrc("lib/postGoogleAuthComplete.ts");
    expect(source).toContain("resolvePostOAuthPath");
    expect(source).toContain("ROUTE_AFTER_AUTH");
    expect(source).toContain("/onboarding");
    expect(source).toContain("/move");
    expect(source).not.toContain("signInWithOAuth");
  });

  it("capacitorOAuth : pas de boucle probe / resume / double signInWithOAuth", () => {
    const source = readSrc("lib/capacitorOAuth.ts");
    expect(source).toContain("lastProcessedOAuthCode");
    expect(source).toContain("handleNativeOAuthCallback");
    expect(source).not.toContain("probeOAuthReturnUrl");
    expect(source).not.toContain("resumeOAuthFromPersistedSession");
    expect(source.match(/signInWithOAuth/g)?.length).toBe(2);
  });

  it("resolvePostOAuthPath : profil complet → /move, incomplet → /onboarding", async () => {
    const completeClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "u1", profile_completed: true, onboarding_completed: true },
              error: null,
            }),
          }),
        }),
      }),
    };

    const incompleteClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "u1",
                profile_completed: false,
                onboarding_completed: false,
                first_name: "Test",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const { resolvePostOAuthPath } = await import("./profileSelect");
    await expect(resolvePostOAuthPath(completeClient as never, "u1")).resolves.toBe("/move");
    await expect(resolvePostOAuthPath(incompleteClient as never, "u1")).resolves.toBe(
      "/onboarding",
    );
  });

  it("BootSplashGate et PostOAuthSplashGate présents (verrou documenté)", () => {
    expect(readSrc("components/BootSplashGate.tsx")).toContain("BootSplashGate");
    expect(readSrc("components/PostOAuthSplashGate.tsx")).toContain("PostOAuthSplashGate");
  });
});

describe("stabilityLocks — photos profil", () => {
  it("onboarding et EditProfile utilisent uploadProfilePhoto", () => {
    const onboarding = readSrc("pages/Onboarding.tsx");
    const editProfile = readSrc("pages/EditProfile.tsx");
    expect(onboarding).toContain('from "../lib/profilePhotoUpload"');
    expect(onboarding).toContain("uploadProfilePhoto");
    expect(editProfile).toContain('from "../lib/profilePhotoUpload"');
    expect(editProfile).toContain("uploadProfilePhoto");
  });

  it("pipeline upload convertit en JPEG via profilePhotoNormalize", () => {
    const upload = readSrc("lib/profilePhotoUpload.ts");
    const normalize = readSrc("lib/profilePhotoNormalize.ts");
    expect(upload).toContain("normalizeProfilePhotoForUpload");
    expect(upload).toContain("PROFILE_PHOTO_JPEG_MIME");
    expect(normalize).toContain('PROFILE_PHOTO_JPEG_MIME = "image/jpeg"');
    expect(normalize).toContain("toBlob");
  });

  it("persiste portrait_url, main_photo_url, avatar_url", () => {
    const onboardingPhotos = readSrc("lib/onboardingProfilePhotos.ts");
    expect(onboardingPhotos).toContain("main_photo_url");
    expect(onboardingPhotos).toContain("avatar_url");
    expect(onboardingPhotos).toContain("portrait_url");
  });

  it("affichage : Discover, Profil, Likes, Messages lisent les URLs canoniques", () => {
    expect(readSrc("pages/Discover.tsx")).toContain("useProfilePhotoDisplaySrc");
    expect(readSrc("pages/Profile.tsx")).toContain("useProfilePhotoDisplaySrc");
    expect(readSrc("pages/LikesYou.tsx")).toMatch(/main_photo_url|portrait_url/);
    expect(readSrc("pages/Chat.tsx")).toMatch(/main_photo_url|portrait_url|avatar_url/);
  });

  it("bucket Storage profile-photos inchangé", () => {
    const upload = readSrc("lib/profilePhotoUpload.ts");
    expect(upload).toContain("PROFILE_PHOTOS_BUCKET");
    expect(readSrc("lib/profilePhotoSignedUrl.ts")).toContain("profile-photos");
  });
});

describe("stabilityLocks — documentation", () => {
  it("STABILITY_LOCKS.md référence les deux zones verrouillées", () => {
    const doc = readFileSync(join(srcRoot, "..", "docs", "STABILITY_LOCKS.md"), "utf8");
    expect(doc).toContain("capacitorOAuth");
    expect(doc).toContain("profilePhotoNormalize");
    expect(doc).toContain("BootSplashGate");
    expect(doc).toContain("portrait_url");
  });
});
