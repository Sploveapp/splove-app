import { describe, expect, it } from "vitest";
import {
  profileMeetingIntentBadgeLabel,
  resolveProfileMeetingIntentTier,
} from "./profileMeetingIntentDisplay";

const t = (key: string) =>
  (
    {
      intention_meet_new_people: "Rencontrer du monde",
      intention_something_more: "Aller plus loin",
      intention_lets_see: "On verra bien",
    } as Record<string, string>
  )[key] ?? key;

describe("profileMeetingIntentDisplay", () => {
  it("Amical → rencontrer du monde", () => {
    expect(resolveProfileMeetingIntentTier("Amical")).toBe("meet_new_people");
    expect(profileMeetingIntentBadgeLabel("Amical", t)).toBe("🤝 Rencontrer du monde");
  });

  it("Amoureux → aller plus loin", () => {
    expect(resolveProfileMeetingIntentTier("Amoureux")).toBe("something_more");
    expect(profileMeetingIntentBadgeLabel("Amoureux", t)).toBe("❤️ Aller plus loin");
  });

  it("both → on verra bien", () => {
    expect(resolveProfileMeetingIntentTier("both")).toBe("lets_see");
    expect(profileMeetingIntentBadgeLabel("both", t)).toBe("😌 On verra bien");
  });
});
