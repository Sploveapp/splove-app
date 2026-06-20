import { describe, expect, it } from "vitest";
import {
  profilePhotoObjectPathFromStoredValue,
  shouldPassThroughProfilePhotoDisplayUrl,
} from "./profilePhotoSignedUrl";

const PUBLIC_URL =
  "https://abc.supabase.co/storage/v1/object/public/profile-photos/user-1/portrait_1.jpg";
const SIGNED_URL =
  "https://abc.supabase.co/storage/v1/object/sign/profile-photos/user-1/portrait_1.jpg?token=expired";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/avatar.jpg";

describe("profilePhotoObjectPathFromStoredValue", () => {
  it("extrait le path depuis une URL publique", () => {
    expect(profilePhotoObjectPathFromStoredValue(PUBLIC_URL)).toBe("user-1/portrait_1.jpg");
  });

  it("extrait le path depuis une signed URL expirée (pas null)", () => {
    expect(profilePhotoObjectPathFromStoredValue(SIGNED_URL)).toBe("user-1/portrait_1.jpg");
  });

  it("extrait le path depuis bucket/path nu", () => {
    expect(profilePhotoObjectPathFromStoredValue("profile-photos/user-1/body.jpg")).toBe(
      "user-1/body.jpg",
    );
  });
});

describe("shouldPassThroughProfilePhotoDisplayUrl", () => {
  it("passe les URL publiques Storage stables", () => {
    expect(shouldPassThroughProfilePhotoDisplayUrl(PUBLIC_URL)).toBe(true);
  });

  it("ne passe pas les signed URLs expirables", () => {
    expect(shouldPassThroughProfilePhotoDisplayUrl(SIGNED_URL)).toBe(false);
  });

  it("passe les avatars externes https", () => {
    expect(shouldPassThroughProfilePhotoDisplayUrl(GOOGLE_AVATAR)).toBe(true);
  });
});
