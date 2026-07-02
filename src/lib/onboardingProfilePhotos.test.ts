import { describe, expect, it } from "vitest";
import {
  normalizeProfileRowCanonicalPhotos,
  profileRowHasCanonicalPhotos,
  resolveFullbodyStoredRefFromRow,
  resolvePortraitStoredRefFromRow,
} from "./onboardingProfilePhotos";

const PORTRAIT =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/u1/portrait_1.jpg";
const FULLBODY =
  "https://example.supabase.co/storage/v1/object/public/profile-photos/u1/activity_1.jpg";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/photo.jpg";

describe("normalizeProfileRowCanonicalPhotos", () => {
  it("résout portrait_url depuis photo2_path / portrait_path legacy", () => {
    const row = {
      id: "u1",
      portrait_url: null,
      fullbody_url: null,
      main_photo_url: null,
      portrait_path: PORTRAIT,
      photo2_path: FULLBODY,
    };
    const normalized = normalizeProfileRowCanonicalPhotos(row)!;
    expect(normalized.portrait_url).toBe(PORTRAIT);
    expect(normalized.fullbody_url).toBe(FULLBODY);
    expect(normalized.main_photo_url).toBe(PORTRAIT);
    expect(profileRowHasCanonicalPhotos(normalized)).toBe(true);
  });

  it("préfère portrait_url Storage à avatar Google OAuth", () => {
    expect(
      resolvePortraitStoredRefFromRow({
        portrait_url: PORTRAIT,
        avatar_url: GOOGLE_AVATAR,
      }),
    ).toBe(PORTRAIT);
  });

  it("utilise avatar_url Storage si portrait_url absent", () => {
    expect(
      resolvePortraitStoredRefFromRow({
        portrait_url: null,
        avatar_url: PORTRAIT,
      }),
    ).toBe(PORTRAIT);
  });

  it("résout fullbody depuis photo2_path", () => {
    expect(
      resolveFullbodyStoredRefFromRow({
        fullbody_url: null,
        photo2_path: FULLBODY,
      }),
    ).toBe(FULLBODY);
  });
});
