import { describe, expect, it } from "vitest";
import { resolveProfilePhotoUploadContentType } from "./profilePhotoUpload";

describe("resolveProfilePhotoUploadContentType", () => {
  it("JPEG avec type MIME vide → image/jpeg", () => {
    expect(
      resolveProfilePhotoUploadContentType(
        { type: "", name: "portrait.jpg" },
        "user-1/portrait_1.jpg",
      ),
    ).toBe("image/jpeg");
    expect(
      resolveProfilePhotoUploadContentType(
        { type: "application/octet-stream", name: "photo" },
        "user-1/portrait_1.jpg",
      ),
    ).toBe("image/jpeg");
  });

  it("PNG → image/png", () => {
    expect(
      resolveProfilePhotoUploadContentType(
        { type: "image/png", name: "shot.png" },
        "user-1/portrait_1.png",
      ),
    ).toBe("image/png");
    expect(
      resolveProfilePhotoUploadContentType(
        { type: "", name: "shot.png" },
        "user-1/activity_1.png",
      ),
    ).toBe("image/png");
  });

  it("image/jpeg explicite reste image/jpeg", () => {
    expect(
      resolveProfilePhotoUploadContentType(
        { type: "image/jpeg", name: "a.heic" },
        "user-1/portrait_1.jpg",
      ),
    ).toBe("image/jpeg");
  });
});
