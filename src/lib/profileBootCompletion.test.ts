import { describe, expect, it } from "vitest";
import {
  areProfileCompletionFlagsUnsettled,
  isProfileCompleteForMove,
} from "./profileBootCompletion";

describe("profileBootCompletion", () => {
  it("null flags = unsettled", () => {
    expect(
      areProfileCompletionFlagsUnsettled({
        id: "u1",
        profile_completed: null,
        onboarding_completed: null,
      }),
    ).toBe(true);
  });

  it("onboarding_completed true = settled", () => {
    expect(
      areProfileCompletionFlagsUnsettled({
        id: "u1",
        onboarding_completed: true,
      }),
    ).toBe(false);
  });

  it("profile_completed true = move", () => {
    expect(isProfileCompleteForMove({ id: "u1", profile_completed: true })).toBe(true);
  });

  it("onboarding_completed true sans profile_completed = move", () => {
    expect(
      isProfileCompleteForMove({
        id: "u1",
        profile_completed: null,
        onboarding_completed: true,
      }),
    ).toBe(true);
  });
});
