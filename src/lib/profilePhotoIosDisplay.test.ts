import { describe, expect, it, vi } from "vitest";
import {
  canMountProfilePhotoImg,
  isSploveProfileStorageHttpUrl,
  resolveIosAwareProfilePhotoDisplaySrc,
} from "./profilePhotoIosDisplay";

vi.mock("./capacitorImageDataUrl", () => ({
  shouldUseIosCapacitorImageFallback: () => true,
  isRemoteHttpImageUrl: (url: string) => url.startsWith("http"),
}));

const STORAGE_SIGNED =
  "https://example.supabase.co/storage/v1/object/sign/profile-photos/user/a.jpg?token=abc";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/avatar.jpg";
const DATA_URL = "data:image/jpeg;base64,abc";

describe("profilePhotoIosDisplay", () => {
  it("isSploveProfileStorageHttpUrl détecte les URLs Storage", () => {
    expect(isSploveProfileStorageHttpUrl(STORAGE_SIGNED)).toBe(true);
    expect(isSploveProfileStorageHttpUrl(GOOGLE_AVATAR)).toBe(false);
  });

  it("iOS : n’expose jamais l’URL Storage distante pendant la résolution", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: null,
        remoteBase: STORAGE_SIGNED,
        isResolving: true,
      }),
    ).toBeNull();
  });

  it("iOS : data URL CapacitorHttp prioritaire", () => {
    expect(
      resolveIosAwareProfilePhotoDisplaySrc({
        iosDisplaySrc: DATA_URL,
        remoteBase: STORAGE_SIGNED,
        isResolving: false,
        usingDataUrl: true,
      }),
    ).toBe(DATA_URL);
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

  it("canMountProfilePhotoImg bloque Storage HTTPS non converti", () => {
    expect(
      canMountProfilePhotoImg(STORAGE_SIGNED, {
        isResolving: false,
        resolutionFailed: true,
        usingDataUrl: false,
      }),
    ).toBe(false);
    expect(
      canMountProfilePhotoImg(DATA_URL, {
        isResolving: false,
        resolutionFailed: false,
        usingDataUrl: true,
      }),
    ).toBe(true);
  });
});
