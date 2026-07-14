import { describe, expect, it } from "vitest";
import {
  collectProfileCriticalDataGaps,
  getDiscoverFeedIntegrityExclusionReasons,
  isDiscoverFeedProfileIntegrityOk,
  profileHasSportsWithValidLevels,
} from "./onboardingDiscoverReadiness";

const PORTRAIT =
  "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/portrait.jpg";
const FULLBODY =
  "https://cdn.example.co/storage/v1/object/public/profile-photos/u1/activity.jpg";

function completeProfileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    first_name: "Linda",
    birth_date: "1995-06-15",
    gender: "female",
    looking_for: "men",
    city: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    discovery_radius_km: 25,
    portrait_url: PORTRAIT,
    fullbody_url: FULLBODY,
    main_photo_url: PORTRAIT,
    onboarding_sports_count: 2,
    onboarding_sports_with_level_count: 2,
    profile_completed: true,
    onboarding_completed: true,
    onboarding_done: true,
    ...overrides,
  };
}

describe("onboardingDiscoverReadiness — complétion Discover / Move", () => {
  it("accepte un profil complet avec sports+niveaux via compteurs", () => {
    const row = completeProfileRow();
    expect(collectProfileCriticalDataGaps(row, 2)).toEqual([]);
    expect(profileHasSportsWithValidLevels(row, 2)).toBe(true);
    expect(isDiscoverFeedProfileIntegrityOk(row, 2)).toBe(true);
  });

  it("rejette un profil sans photo principale", () => {
    const row = completeProfileRow({
      portrait_url: null,
      main_photo_url: null,
    });
    expect(collectProfileCriticalDataGaps(row, 2)).toContain("portrait_or_main_photo");
    expect(isDiscoverFeedProfileIntegrityOk(row, 2)).toBe(false);
  });

  it("rejette un profil sans prénom ou date de naissance", () => {
    expect(collectProfileCriticalDataGaps(completeProfileRow({ first_name: "" }), 2)).toContain(
      "first_name",
    );
    expect(collectProfileCriticalDataGaps(completeProfileRow({ birth_date: null }), 2)).toContain(
      "birth_date",
    );
  });

  it("rejette un profil sans niveau sportif valide", () => {
    const row = completeProfileRow({
      onboarding_sports_with_level_count: 0,
      profile_sports: [{ sport_id: 1, level: null, sports: { label: "Tennis", slug: "tennis" } }],
    });
    expect(collectProfileCriticalDataGaps(row, 1)).toContain("profile_sports_with_level");
    expect(profileHasSportsWithValidLevels(row, 1)).toBe(false);
  });

  it("accepte les niveaux via jointure profile_sports", () => {
    const row = completeProfileRow({
      onboarding_sports_count: 2,
      onboarding_sports_with_level_count: 0,
      profile_sports: [
        { sport_id: 1, level: "intermediate", sports: { label: "Randonnée", slug: "randonnee" } },
        { sport_id: 2, level: "intermediate", sports: { label: "Tennis", slug: "tennis" } },
      ],
    });
    expect(profileHasSportsWithValidLevels(row, 2)).toBe(true);
    expect(collectProfileCriticalDataGaps(row, 2)).not.toContain("profile_sports_with_level");
  });

  it("marque les profils fantômes profile_completed sans données critiques", () => {
    const row = completeProfileRow({
      portrait_url: null,
      main_photo_url: null,
      profile_completed: true,
      onboarding_completed: false,
      onboarding_done: false,
    });
    const reasons = getDiscoverFeedIntegrityExclusionReasons(row, 2);
    expect(reasons).toContain("missing_portrait_or_main_photo");
    expect(reasons).toContain("missing_onboarding_completed");
    expect(reasons).toContain("ghost_profile_completed_flag");
  });
});
