import { describe, expect, it } from "vitest";
import { pickOnboardingFacePreviewSrc } from "../pages/Onboarding";

const HTTPS_PORTRAIT =
  "https://abc.supabase.co/storage/v1/object/public/profile-photos/u1/portrait_1.jpg";

describe("Onboarding face preview — chemin réel preview_state", () => {
  it("si portraitSavedUrl est HTTPS, facePreviewSrc n’est jamais missing (même si remoteResolved=null)", () => {
    const src = pickOnboardingFacePreviewSrc({
      localPersisted: null,
      fileObjectUrl: null,
      remoteResolved: null,
      portraitSavedUrl: HTTPS_PORTRAIT,
    });
    expect(src).toBe(HTTPS_PORTRAIT);
  });

  it("utilise profile.portrait_url si portraitSavedUrl est vide", () => {
    const src = pickOnboardingFacePreviewSrc({
      localPersisted: null,
      fileObjectUrl: null,
      remoteResolved: null,
      portraitSavedUrl: "",
      profilePortraitUrl: HTTPS_PORTRAIT,
    });
    expect(src).toBe(HTTPS_PORTRAIT);
  });

  it("priorise main_photo_url puis avatar_url", () => {
    expect(
      pickOnboardingFacePreviewSrc({
        localPersisted: null,
        fileObjectUrl: null,
        remoteResolved: null,
        portraitSavedUrl: "",
        profileMainPhotoUrl: HTTPS_PORTRAIT,
      }),
    ).toBe(HTTPS_PORTRAIT);

    expect(
      pickOnboardingFacePreviewSrc({
        localPersisted: null,
        fileObjectUrl: null,
        remoteResolved: null,
        portraitSavedUrl: "",
        profileAvatarUrl: HTTPS_PORTRAIT,
      }),
    ).toBe(HTTPS_PORTRAIT);
  });

  it("missing uniquement si aucune URL HTTP(S) directe ni remote", () => {
    const src = pickOnboardingFacePreviewSrc({
      localPersisted: null,
      fileObjectUrl: null,
      remoteResolved: null,
      portraitSavedUrl: "",
    });
    expect(src).toBeNull();
  });

  it("local/file gagnent sur l’URL HTTPS distante", () => {
    expect(
      pickOnboardingFacePreviewSrc({
        localPersisted: "blob:local-face",
        fileObjectUrl: null,
        remoteResolved: null,
        portraitSavedUrl: HTTPS_PORTRAIT,
      }),
    ).toBe("blob:local-face");
  });
});
