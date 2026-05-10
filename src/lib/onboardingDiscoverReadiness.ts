import { isValidDiscoveryRadiusKm } from "../constants/discoverGeo";

const SPORT_PREF_ALLOWED = ["same_sports", "open_to_different_sports", "both"] as const;

function isValidSportMatchPreference(raw: unknown): boolean {
  return typeof raw === "string" && (SPORT_PREF_ALLOWED as readonly string[]).includes(raw.trim());
}

function hasPortraitOrMainPhoto(row: Record<string, unknown>): boolean {
  const rawP = row.portrait_url;
  const rawM = row.main_photo_url;
  const p = typeof rawP === "string" ? rawP.trim() : "";
  const m = typeof rawM === "string" ? rawM.trim() : "";
  return Boolean(p.length > 0 || m.length > 0);
}

const FIELD_TO_STEP: Record<string, number> = {
  city: 4,
  latitude: 4,
  longitude: 4,
  discovery_radius_km: 4,
  sport_match_preference: 6,
  profile_sports_rows: 5,
  portrait_or_main_photo: 9,
  profile_completed: 11,
  onboarding_completed: 11,
  onboarding_done: 11,
};

/**
 * Garde-finale avant Discover : données critiques présentes après onboarding (ou reload session).
 */
export function auditOnboardingProfileForDiscover(
  profileRow: Record<string, unknown>,
  profileSportsRowCount: number,
):
  | { ok: true }
  | { ok: false; missingFields: string[]; suggestedStep: number } {
  const missing: string[] = [];

  if (!(typeof profileRow.city === "string" && profileRow.city.trim().length >= 2)) {
    missing.push("city");
  }

  const lat = profileRow.latitude;
  const lng = profileRow.longitude;
  const latOk = typeof lat === "number" && Number.isFinite(lat);
  const lngOk = typeof lng === "number" && Number.isFinite(lng);
  if (!latOk) missing.push("latitude");
  if (!lngOk) missing.push("longitude");

  if (!isValidDiscoveryRadiusKm(profileRow.discovery_radius_km)) {
    missing.push("discovery_radius_km");
  }

  if (!isValidSportMatchPreference(profileRow.sport_match_preference)) {
    missing.push("sport_match_preference");
  }

  if ((Number.isFinite(profileSportsRowCount) ? profileSportsRowCount : 0) < 1) {
    missing.push("profile_sports_rows");
  }

  if (!hasPortraitOrMainPhoto(profileRow)) {
    missing.push("portrait_or_main_photo");
  }

  if (profileRow.profile_completed !== true) missing.push("profile_completed");
  if ((profileRow as { onboarding_completed?: unknown }).onboarding_completed !== true) {
    missing.push("onboarding_completed");
  }
  if ((profileRow as { onboarding_done?: unknown }).onboarding_done !== true) {
    missing.push("onboarding_done");
  }

  if (missing.length === 0) return { ok: true };

  const steps = missing.map((f) => FIELD_TO_STEP[f] ?? 11).filter(Number.isFinite);
  const suggestedStep = steps.length > 0 ? Math.min(...steps) : 11;
  return { ok: false, missingFields: missing, suggestedStep };
}
