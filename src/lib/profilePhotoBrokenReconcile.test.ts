import { describe, expect, it } from "vitest";
import { evaluateProfilePhotoStorageHead } from "./profilePhotoStorageHealth";
import { stripBrokenProfilePhotoUrlsFromRow } from "./profilePhotoBrokenReconcile";

describe("evaluateProfilePhotoStorageHead", () => {
  it("marque 0 octet comme cassé", () => {
    expect(evaluateProfilePhotoStorageHead(200, "image/jpeg", 0)).toMatchObject({
      valid: false,
      broken: true,
      reason: "empty",
    });
  });

  it("marque octet-stream comme cassé", () => {
    expect(evaluateProfilePhotoStorageHead(200, "application/octet-stream", 0)).toMatchObject({
      valid: false,
      broken: true,
      reason: "empty",
    });
  });

  it("accepte image/jpeg valide", () => {
    expect(evaluateProfilePhotoStorageHead(200, "image/jpeg", 1200)).toMatchObject({
      valid: true,
      broken: false,
      reason: "ok",
    });
  });
});

describe("stripBrokenProfilePhotoUrlsFromRow", () => {
  it("retire les URLs cassées et recalcule main_photo_url", () => {
    const broken = new Set(["https://x.test/storage/v1/object/public/profile-photos/u1/portrait.jpg"]);
    const { row, clearedFields } = stripBrokenProfilePhotoUrlsFromRow(
      {
        id: "u1",
        portrait_url: "https://x.test/storage/v1/object/public/profile-photos/u1/portrait.jpg",
        main_photo_url: "https://x.test/storage/v1/object/public/profile-photos/u1/portrait.jpg",
        avatar_url: "https://x.test/storage/v1/object/public/profile-photos/u1/portrait.jpg",
        fullbody_url: "https://x.test/storage/v1/object/public/profile-photos/u1/body.jpg",
      },
      broken,
    );
    expect(row.portrait_url).toBeNull();
    expect(row.main_photo_url).toBe(row.fullbody_url);
    expect(clearedFields).toContain("portrait_url");
  });
});
