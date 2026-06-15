import { describe, expect, it } from "vitest";
import { mergeAuthProfileRow, mergeProfileScreenRowPreservingPhotos } from "./profileScreenHydrate";

const USER_ID = "user-abc";
const PORTRAIT_A = "https://cdn.example.co/storage/portrait-a.jpg";
const PORTRAIT_B = "https://cdn.example.co/storage/portrait-b.jpg";

describe("mergeProfileScreenRowPreservingPhotos", () => {
  it("conserve portrait_url quand la row entrante a null", () => {
    const merged = mergeProfileScreenRowPreservingPhotos(
      { id: USER_ID, portrait_url: PORTRAIT_A, main_photo_url: PORTRAIT_A },
      { id: USER_ID, portrait_url: null, main_photo_url: null, first_name: "Linda" },
    );
    expect(merged.portrait_url).toBe(PORTRAIT_A);
    expect(merged.main_photo_url).toBe(PORTRAIT_A);
    expect(merged.first_name).toBe("Linda");
  });

  it("conserve portrait_url quand la row entrante a une chaîne vide", () => {
    const merged = mergeProfileScreenRowPreservingPhotos(
      { id: USER_ID, portrait_url: PORTRAIT_A, avatar_url: PORTRAIT_A },
      { id: USER_ID, portrait_url: "  ", avatar_url: "", fullbody_url: null },
    );
    expect(merged.portrait_url).toBe(PORTRAIT_A);
    expect(merged.avatar_url).toBe(PORTRAIT_A);
  });

  it("accepte une nouvelle photo valide depuis la row entrante", () => {
    const merged = mergeProfileScreenRowPreservingPhotos(
      { id: USER_ID, portrait_url: PORTRAIT_A, main_photo_url: PORTRAIT_A },
      { id: USER_ID, portrait_url: PORTRAIT_B, main_photo_url: PORTRAIT_B },
    );
    expect(merged.portrait_url).toBe(PORTRAIT_B);
    expect(merged.main_photo_url).toBe(PORTRAIT_B);
  });
});

describe("mergeAuthProfileRow", () => {
  it("premier chargement sans photo : passe la row entrante telle quelle", () => {
    const incoming = { id: USER_ID, first_name: "Linda", portrait_url: null };
    expect(mergeAuthProfileRow(null, incoming)).toEqual(incoming);
    expect(mergeAuthProfileRow({ id: "other-user" }, incoming)).toEqual(incoming);
  });

  it("photo existante + refetch NULL → photo conservée", () => {
    const prev = { id: USER_ID, portrait_url: PORTRAIT_A, main_photo_url: PORTRAIT_A };
    const merged = mergeAuthProfileRow(prev, {
      id: USER_ID,
      portrait_url: null,
      main_photo_url: null,
      profile_completed: true,
    });
    expect(merged.portrait_url).toBe(PORTRAIT_A);
    expect(merged.main_photo_url).toBe(PORTRAIT_A);
    expect(merged.profile_completed).toBe(true);
  });

  it("photo existante + refetch vide → photo conservée", () => {
    const prev = { id: USER_ID, portrait_url: PORTRAIT_A, fullbody_url: "https://x.co/body.jpg" };
    const merged = mergeAuthProfileRow(prev, {
      id: USER_ID,
      portrait_url: "",
      fullbody_url: "   ",
    });
    expect(merged.portrait_url).toBe(PORTRAIT_A);
    expect(merged.fullbody_url).toBe("https://x.co/body.jpg");
  });

  it("photo existante + nouvelle photo valide → nouvelle photo conservée", () => {
    const prev = { id: USER_ID, portrait_url: PORTRAIT_A };
    const merged = mergeAuthProfileRow(prev, {
      id: USER_ID,
      portrait_url: PORTRAIT_B,
      main_photo_url: PORTRAIT_B,
    });
    expect(merged.portrait_url).toBe(PORTRAIT_B);
    expect(merged.main_photo_url).toBe(PORTRAIT_B);
  });

  it("conserve les autres champs non photo depuis le refetch", () => {
    const prev = { id: USER_ID, portrait_url: PORTRAIT_A, sport_phrase: "ancienne" };
    const merged = mergeAuthProfileRow(prev, {
      id: USER_ID,
      portrait_url: null,
      sport_phrase: "nouvelle bio",
      city: "Paris",
    });
    expect(merged.portrait_url).toBe(PORTRAIT_A);
    expect(merged.sport_phrase).toBe("nouvelle bio");
    expect(merged.city).toBe("Paris");
  });
});
