import { describe, expect, it } from "vitest";
import { getUserMainPhoto, getUserMainPhotoRefCandidates, getUserMainPhotoUrl } from "./userMainPhoto";

describe("getUserMainPhoto", () => {
  it("priorise main_photo_url puis portrait_url puis avatar_url", () => {
    expect(
      getUserMainPhoto({
        id: "u1",
        main_photo_url: "https://x.co/main.jpg",
        portrait_url: "https://x.co/portrait.jpg",
        avatar_url: "https://x.co/avatar.jpg",
      }),
    ).toMatchObject({
      userId: "u1",
      storedRef: "https://x.co/main.jpg",
      sourceField: "main_photo_url",
    });

    expect(
      getUserMainPhoto({
        portrait_url: "https://x.co/portrait.jpg",
        avatar_url: "https://x.co/avatar.jpg",
      }),
    ).toMatchObject({
      storedRef: "https://x.co/portrait.jpg",
      sourceField: "portrait_url",
    });

    expect(
      getUserMainPhoto({ avatar_url: "https://x.co/avatar.jpg" }),
    ).toMatchObject({
      storedRef: "https://x.co/avatar.jpg",
      sourceField: "avatar_url",
    });
  });

  it("retourne null si aucune photo", () => {
    expect(getUserMainPhoto({ id: "u2" })).toMatchObject({
      storedRef: null,
      sourceField: null,
    });
  });

  it("utilise fullbody_url en dernier recours", () => {
    expect(
      getUserMainPhoto({
        fullbody_url: "https://x.co/fullbody.jpg",
      }),
    ).toMatchObject({
      storedRef: "https://x.co/fullbody.jpg",
      sourceField: "fullbody_url",
    });
  });
});

describe("getUserMainPhotoUrl", () => {
  it("retourne storedRef de getUserMainPhoto", () => {
    expect(
      getUserMainPhotoUrl({
        portrait_url: "https://x.co/portrait.jpg",
      }),
    ).toBe("https://x.co/portrait.jpg");
    expect(getUserMainPhotoUrl({})).toBeNull();
  });
});

describe("getUserMainPhotoRefCandidates", () => {
  it("retourne les refs uniques dans l’ordre canonique", () => {
    const { refs, fieldByRef } = getUserMainPhotoRefCandidates({
      main_photo_url: "https://x.co/same.jpg",
      portrait_url: "https://x.co/same.jpg",
      avatar_url: "https://x.co/other.jpg",
    });
    expect(refs).toEqual(["https://x.co/same.jpg", "https://x.co/other.jpg"]);
    expect(fieldByRef["https://x.co/same.jpg"]).toBe("main_photo_url");
    expect(fieldByRef["https://x.co/other.jpg"]).toBe("avatar_url");
  });

  it("inclut fullbody_url après les champs principaux", () => {
    const { refs, fieldByRef } = getUserMainPhotoRefCandidates({
      fullbody_url: "https://x.co/body.jpg",
    });
    expect(refs).toEqual(["https://x.co/body.jpg"]);
    expect(fieldByRef["https://x.co/body.jpg"]).toBe("fullbody_url");
  });
});
