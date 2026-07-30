import { describe, expect, it, vi } from "vitest";
import {
  auditSelfProfilePhotoUrl,
  canMountProfilePhotoImg,
  isAcceptableSelfProfileSignedUrl,
  isSploveProfileStorageHttpUrl,
  pickSelfProfileDirectHttpsSrc,
  resolveIosAwareProfilePhotoDisplaySrc,
  resolveSelfProfileAvatarImgSrc,
} from "./profilePhotoIosDisplay";

vi.mock("./capacitorImageDataUrl", () => ({
  shouldUseIosCapacitorImageFallback: () => true,
  isRemoteHttpImageUrl: (url: string) => url.startsWith("http"),
}));

const STORAGE_SIGNED =
  "https://example.supabase.co/storage/v1/object/sign/profile-photos/user/a.jpg?token=abc";
const STORAGE_PUBLIC =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/user/a.jpg";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/avatar.jpg";
const DATA_URL = "data:image/jpeg;base64,abc";

describe("profilePhotoIosDisplay", () => {
  it("isSploveProfileStorageHttpUrl détecte les URLs Storage", () => {
    expect(isSploveProfileStorageHttpUrl(STORAGE_SIGNED)).toBe(true);
    expect(isSploveProfileStorageHttpUrl(GOOGLE_AVATAR)).toBe(false);
  });

  it("iosSrc présent → iosSrc utilisé", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: DATA_URL,
        remoteBase: STORAGE_PUBLIC,
        isResolving: false,
        usingDataUrl: true,
      }),
    ).toBe(DATA_URL);
  });

  it("iosSrc absent + public profile-photos HTTPS valide → remote utilisé", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: STORAGE_PUBLIC,
        isResolving: false,
      }),
    ).toBe(STORAGE_PUBLIC);
  });

  it("isResolving = true + remote public valide → remote utilisé", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: STORAGE_PUBLIC,
        isResolving: true,
      }),
    ).toBe(STORAGE_PUBLIC);
  });

  it("resolutionFailed = true + remote public valide → remote utilisé", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: STORAGE_PUBLIC,
        isResolving: false,
        resolutionFailed: true,
        usingDataUrl: false,
      }),
    ).toBe(STORAGE_PUBLIC);
  });

  it("iosSrc absent + remote absent → null", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: null,
      }),
    ).toBeNull();
  });

  it("iOS : avatar OAuth externe affichable sans data URL", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: GOOGLE_AVATAR,
        isResolving: false,
      }),
    ).toBe(GOOGLE_AVATAR);
  });

  it("canMountProfilePhotoImg autorise Storage HTTPS public", () => {
    expect(
      canMountProfilePhotoImg(STORAGE_PUBLIC, {
        isResolving: false,
        resolutionFailed: true,
        usingDataUrl: false,
      }),
    ).toBe(true);
    expect(
      canMountProfilePhotoImg(DATA_URL, {
        isResolving: false,
        resolutionFailed: false,
        usingDataUrl: true,
      }),
    ).toBe(true);
  });
});

describe("resolveSelfProfileAvatarImgSrc — signed token + public fallback", () => {
  const PUBLIC =
    "https://example.supabase.co/storage/v1/object/public/profile-photos/u/portrait.jpg";
  const SIGNED_OK =
    "https://example.supabase.co/storage/v1/object/sign/profile-photos/u/portrait.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def";
  const SIGNED_BAD_E =
    "https://example.supabase.co/storage/v1/object/sign/profile-photos/u/portrait.jpg?token=e";
  const SIGNED_SHORT =
    "https://example.supabase.co/storage/v1/object/sign/profile-photos/u/portrait.jpg?token=ab";

  it("signed URL avec token complet → acceptée", () => {
    expect(isAcceptableSelfProfileSignedUrl(SIGNED_OK)).toBe(true);
    const audit = auditSelfProfilePhotoUrl(SIGNED_OK);
    expect(audit.validSignedUrl).toBe(true);
    expect(audit.tokenPresent).toBe(true);
    expect((audit.tokenLength ?? 0) >= 16).toBe(true);

    const decision = resolveSelfProfileAvatarImgSrc({
      hookSrc: SIGNED_OK,
    });
    expect(decision.src).toBe(SIGNED_OK);
    expect(decision.sourceKind).toBe("signed_https");
  });

  it("signed URL avec token e ou trop court → rejetée", () => {
    expect(isAcceptableSelfProfileSignedUrl(SIGNED_BAD_E)).toBe(false);
    expect(isAcceptableSelfProfileSignedUrl(SIGNED_SHORT)).toBe(false);
    expect(auditSelfProfilePhotoUrl(SIGNED_BAD_E).tokenLength).toBe(1);
  });

  it("signed rejetée + portrait_url public → utilise portrait_url", () => {
    const decision = resolveSelfProfileAvatarImgSrc({
      portraitUrl: PUBLIC,
      hookSrc: SIGNED_BAD_E,
    });
    expect(decision.src).toBe(PUBLIC);
    expect(decision.sourceKind).toBe("public_https");
  });

  it("priorité : publique avant signed hook même si signed valide", () => {
    const decision = resolveSelfProfileAvatarImgSrc({
      portraitUrl: PUBLIC,
      hookSrc: SIGNED_OK,
    });
    expect(decision.src).toBe(PUBLIC);
    expect(decision.sourceKind).toBe("public_https");
  });

  it("aucune source valide → placeholder (null)", () => {
    const decision = resolveSelfProfileAvatarImgSrc({
      hookSrc: SIGNED_BAD_E,
    });
    expect(decision.src).toBeNull();
    expect(decision.sourceKind).toBe("null");
  });

  it("data URL prioritaire sur publique", () => {
    const decision = resolveSelfProfileAvatarImgSrc({
      iosLayerDisplaySrc: DATA_URL,
      portraitUrl: PUBLIC,
      hookSrc: SIGNED_OK,
    });
    expect(decision.src).toBe(DATA_URL);
    expect(decision.sourceKind).toBe("data_url");
  });

  it("pickSelfProfileDirectHttpsSrc respecte la priorité", () => {
    expect(
      pickSelfProfileDirectHttpsSrc(
        "https://a.example/hook.jpg",
        "https://a.example/portrait.jpg",
      ),
    ).toBe("https://a.example/hook.jpg");
  });
});
