import { describe, expect, it } from "vitest";
import { mergeProfileRowPreservingCompletion } from "./onboardingCompletion";

const PORTRAIT = "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/portrait.jpg";
const FULLBODY = "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/body.jpg";

describe("mergeProfileRowPreservingCompletion", () => {
  it("conserve les URLs photo quand le patch reload a null", () => {
    const base = {
      id: "u1",
      portrait_url: PORTRAIT,
      main_photo_url: PORTRAIT,
      avatar_url: PORTRAIT,
      fullbody_url: FULLBODY,
      profile_completed: true,
      onboarding_completed: true,
    };
    const patch = {
      id: "u1",
      portrait_url: null,
      main_photo_url: null,
      avatar_url: null,
      fullbody_url: null,
      profile_completed: true,
      onboarding_done: true,
    };
    const merged = mergeProfileRowPreservingCompletion(base, patch);
    expect(merged.portrait_url).toBe(PORTRAIT);
    expect(merged.main_photo_url).toBe(PORTRAIT);
    expect(merged.fullbody_url).toBe(FULLBODY);
    expect(merged.onboarding_done).toBe(true);
  });

  it("conserve profile_completed quand le patch ne le remet pas à true", () => {
    const base = { id: "u1", profile_completed: true, onboarding_completed: true };
    const patch = { id: "u1", profile_completed: false, onboarding_completed: false };
    const merged = mergeProfileRowPreservingCompletion(base, patch);
    expect(merged.profile_completed).toBe(true);
    expect(merged.onboarding_completed).toBe(true);
  });
});
