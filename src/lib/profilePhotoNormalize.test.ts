import { describe, expect, it } from "vitest";
import {
  PROFILE_PHOTO_JPEG_EXT,
  PROFILE_PHOTO_JPEG_MIME,
  PROFILE_PHOTO_JPEG_QUALITY,
  buildNormalizedProfilePhotoFileName,
} from "./profilePhotoNormalize";

describe("buildNormalizedProfilePhotoFileName", () => {
  it("remplace l’extension HEIC par .jpg", () => {
    expect(buildNormalizedProfilePhotoFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
  });

  it("remplace png/webp/jpeg par .jpg", () => {
    expect(buildNormalizedProfilePhotoFileName("portrait.png")).toBe("portrait.jpg");
    expect(buildNormalizedProfilePhotoFileName("body.webp")).toBe("body.jpg");
    expect(buildNormalizedProfilePhotoFileName("photo.jpeg")).toBe("photo.jpg");
  });

  it("sanitise les caractères spéciaux et fournit un fallback", () => {
    expect(buildNormalizedProfilePhotoFileName(" ma photo (1).HEIC ")).toBe("ma_photo_1.jpg");
    expect(buildNormalizedProfilePhotoFileName("")).toBe("profile_photo.jpg");
  });
});

describe("profile photo JPEG constants", () => {
  it("utilise image/jpeg, extension jpg et qualité 0.85", () => {
    expect(PROFILE_PHOTO_JPEG_MIME).toBe("image/jpeg");
    expect(PROFILE_PHOTO_JPEG_EXT).toBe("jpg");
    expect(PROFILE_PHOTO_JPEG_QUALITY).toBe(0.85);
  });
});
