import { isAdultFromBirthIso } from "./ageGate";
import { isValidDiscoveryRadiusKm } from "../constants/discoverGeo";
import { parseHeightCmOptionalInput } from "./profileHeightCm";
import { PROFILE_MIN_VISIBLE_AGE } from "./profileAge";

export type OnboardingFillSnapshot = {
  firstName: string;
  birthDate: string;
  gender: string;
  interestedIn: readonly string[];
  intent: string;
  preferredAgeMinStr: string;
  preferredAgeMaxStr: string;
  heightCmInput: string;
  city: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  sportIds: readonly string[];
  sportLevelsById: Readonly<Record<string, string | undefined>>;
  portraitSavedUrl: string;
  bodySavedUrl: string;
  hasPortraitFile: boolean;
  hasBodyFile: boolean;
  confirm18: boolean;
  acceptTerms: boolean;
  openToAdaptedPractice: string;
  /** Phrase / ligne optionnelle (ex. sport_phrase). */
  optionalPhrase?: string;
};

function preferredAgeOk(minStr: string, maxStr: string): boolean {
  const amin = Number.parseInt(minStr.trim(), 10);
  const amax = Number.parseInt(maxStr.trim(), 10);
  return (
    Number.isFinite(amin) &&
    Number.isFinite(amax) &&
    amin >= PROFILE_MIN_VISIBLE_AGE &&
    amax >= PROFILE_MIN_VISIBLE_AGE &&
    amin <= amax
  );
}

/**
 * Pourcentage indicatif 0–100 (front uniquement), aligné sur les champs critiques du parcours.
 * Ne remplace pas les drapeaux BDD ni `auditOnboardingProfileForDiscover`.
 */
export function computeOnboardingProfileFillPercent(s: OnboardingFillSnapshot): number {
  let pts = 0;

  if (s.firstName.trim().length >= 1) pts += 6;
  if (s.birthDate && isAdultFromBirthIso(s.birthDate)) pts += 9;
  if (s.gender.trim() !== "") pts += 6;
  if (s.interestedIn.length > 0) pts += 6;
  if (s.intent.trim() !== "") pts += 6;
  if (preferredAgeOk(s.preferredAgeMinStr, s.preferredAgeMaxStr)) pts += 5;
  if (parseHeightCmOptionalInput(s.heightCmInput) != null) pts += 5;

  const locOk =
    s.city.trim().length >= 2 &&
    typeof s.lat === "number" &&
    Number.isFinite(s.lat) &&
    typeof s.lng === "number" &&
    Number.isFinite(s.lng) &&
    isValidDiscoveryRadiusKm(s.radiusKm);
  if (locOk) pts += 10;

  const nSports = s.sportIds.length;
  if (nSports >= 1 && nSports <= 3) {
    pts += 8;
    if (s.sportIds.every((id) => Boolean(s.sportLevelsById[String(id)]?.trim()))) pts += 6;
  }

  const hasPortrait = Boolean(s.portraitSavedUrl.trim()) || s.hasPortraitFile;
  const hasBody = Boolean(s.bodySavedUrl.trim()) || s.hasBodyFile;
  if (hasPortrait) pts += 9;
  if (hasBody) pts += 9;

  if (s.confirm18) pts += 4;
  if (s.acceptTerms) pts += 4;
  if (s.openToAdaptedPractice.trim() !== "") pts += 5;

  const phrase = (s.optionalPhrase ?? "").trim();
  if (phrase.length >= 8) pts += 2;

  const raw = Math.min(100, Math.round(pts));

  const submitReady =
    s.firstName.trim().length >= 1 &&
    Boolean(s.birthDate && isAdultFromBirthIso(s.birthDate)) &&
    s.gender.trim() !== "" &&
    s.interestedIn.length > 0 &&
    s.intent.trim() !== "" &&
    preferredAgeOk(s.preferredAgeMinStr, s.preferredAgeMaxStr) &&
    parseHeightCmOptionalInput(s.heightCmInput) != null &&
    locOk &&
    nSports >= 1 &&
    nSports <= 3 &&
    s.sportIds.every((id) => Boolean(s.sportLevelsById[String(id)]?.trim())) &&
    hasPortrait &&
    hasBody &&
    s.confirm18 &&
    s.acceptTerms &&
    s.openToAdaptedPractice.trim() !== "";

  if (submitReady && raw >= 98) {
    return 100;
  }

  return raw;
}
