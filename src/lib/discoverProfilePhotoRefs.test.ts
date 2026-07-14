import { describe, expect, it } from "vitest";
import { buildMovePrimaryPhotoRefs } from "../hooks/useMoveProfilePhotosFromRefs";

describe("buildMovePrimaryPhotoRefs", () => {
  it("inclut portrait_path legacy quand les colonnes canoniques sont vides", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const legacyPath = `${userId}/portrait_1700000000000.jpg`;
    const { refs, fieldByRef } = buildMovePrimaryPhotoRefs({
      id: userId,
      portrait_url: null,
      main_photo_url: null,
      avatar_url: null,
      portrait_path: legacyPath,
    } as never);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toContain(userId);
    expect(fieldByRef[refs[0]!]).toBe("portrait_path");
  });

  it("déduplique portrait, main et avatar identiques", () => {
    const url =
      "https://example.supabase.co/storage/v1/object/public/profile-photos/u/portrait.jpg";
    const { refs, fieldByRef } = buildMovePrimaryPhotoRefs({
      portrait_url: url,
      main_photo_url: url,
      avatar_url: url,
    });

    expect(refs).toEqual([url]);
    expect(fieldByRef[url]).toBe("portrait_url");
  });

  it("garde avatar_url distinct si portrait échoue en résolution (candidat suivant)", () => {
    const portrait =
      "https://example.supabase.co/storage/v1/object/public/profile-photos/u/broken.jpg";
    const avatar =
      "https://example.supabase.co/storage/v1/object/public/profile-photos/u/avatar.jpg";
    const { refs, fieldByRef } = buildMovePrimaryPhotoRefs({
      portrait_url: portrait,
      avatar_url: avatar,
    });

    expect(refs).toEqual([portrait, avatar]);
    expect(fieldByRef[portrait]).toBe("portrait_url");
    expect(fieldByRef[avatar]).toBe("avatar_url");
  });
});
