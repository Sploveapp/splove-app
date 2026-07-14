import { describe, expect, it } from "vitest";
import {
  countOnboardingPersistedPhotoSlots,
  onboardingPhotoSlotPersisted,
  onboardingPhotosFullyPersisted,
} from "./onboardingPhotoSlots";

describe("onboardingPhotoSlots", () => {
  it("ne compte une fente remplie que si l’URL persistée existe", () => {
    expect(onboardingPhotoSlotPersisted("")).toBe(false);
    expect(onboardingPhotoSlotPersisted("  ")).toBe(false);
    expect(
      onboardingPhotoSlotPersisted(
        "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/portrait.jpg",
      ),
    ).toBe(true);
  });

  it("exige deux URLs persistées avant de terminer l’onboarding", () => {
    const portrait =
      "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/portrait.jpg";
    const fullbody =
      "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/activity.jpg";

    expect(countOnboardingPersistedPhotoSlots("", "")).toBe(0);
    expect(countOnboardingPersistedPhotoSlots(portrait, "")).toBe(1);
    expect(onboardingPhotosFullyPersisted(portrait, "")).toBe(false);
    expect(onboardingPhotosFullyPersisted(portrait, fullbody)).toBe(true);
  });
});
