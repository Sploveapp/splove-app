import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS,
  verifyUploadedProfilePhotoPublicUrl,
} from "./profilePhotoUploadVerify";

describe("verifyUploadedProfilePhotoPublicUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejette content-length 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-length" ? "0" : name === "content-type" ? "image/jpeg" : null,
        },
      })),
    );

    const result = await verifyUploadedProfilePhotoPublicUrl("https://x.test/photo.jpg");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.EMPTY);
    }
  });

  it("rejette application/octet-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-length"
              ? "1024"
              : name === "content-type"
                ? "application/octet-stream"
                : null,
        },
      })),
    );

    const result = await verifyUploadedProfilePhotoPublicUrl("https://x.test/photo.jpg");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(PROFILE_PHOTO_UPLOAD_VERIFY_ERRORS.BAD_CONTENT_TYPE);
    }
  });

  it("accepte image/jpeg avec taille > 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-length" ? "2048" : name === "content-type" ? "image/jpeg" : null,
        },
      })),
    );

    const result = await verifyUploadedProfilePhotoPublicUrl("https://x.test/photo.jpg");
    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      contentLength: 2048,
      contentType: "image/jpeg",
    });
  });
});
