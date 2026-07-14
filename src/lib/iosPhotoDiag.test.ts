import { describe, expect, it } from "vitest";
import {
  IOS_PHOTO_DIAG_KNOWN_IDS,
  logIosPhotoDiag,
  registerMoveProfilePhotoRowForDiag,
  setIosPhotoDiagAuthUserId,
} from "./iosPhotoDiag";
import { moveProfilePhotoDisplayCacheKey } from "./moveProfilePhotoCache";

describe("iosPhotoDiag", () => {
  it("compose une clé display liée au profile.id", () => {
    const profileId = "98197128-abcd-efgh-ijkl-mnopqrstuvwx";
    const ref = "https://x.supabase.co/storage/v1/object/public/profile-photos/u/p.jpg";
    const key = moveProfilePhotoDisplayCacheKey(profileId, ref);
    expect(key.startsWith(`${profileId}|`)).toBe(true);
    expect(key).not.toContain("Linda");
    expect(key).not.toContain("primary");
  });

  it("expose les préfixes UUID connus pour comparaison iPhone vs Render", () => {
    expect(IOS_PHOTO_DIAG_KNOWN_IDS.viewerCurrentPrefix).toBe("7fcc9bca");
    expect(IOS_PHOTO_DIAG_KNOWN_IDS.lindaObservedPrefix).toBe("98197128");
  });

  it("enregistre le snapshot profil pour les logs Move", () => {
    setIosPhotoDiagAuthUserId("7fcc9bca-1111-2222-3333-444455556666");
    registerMoveProfilePhotoRowForDiag({
      id: "98197128-aaaa-bbbb-cccc-ddddeeeeffff",
      first_name: "Linda",
      portrait_url: "https://x/p.jpg",
      main_photo_url: "https://x/m.jpg",
      avatar_url: "https://x/a.jpg",
    });
    expect(() =>
      logIosPhotoDiag("profile_candidate", {
        profileId: "98197128-aaaa-bbbb-cccc-ddddeeeeffff",
        logSource: "discover.swipe_card",
      }),
    ).not.toThrow();
  });
});
