import { isAdultFromBirthIso } from "./ageGate";
import { isValidDiscoveryRadiusKm } from "../constants/discoverGeo";
import {
  auditProfileCriticalDataForDiscover,
  collectProfileCriticalDataGaps,
} from "./onboardingDiscoverReadiness";
import {
  computeOnboardingProfileFillPercent,
  type OnboardingFillSnapshot,
} from "./onboardingProfileFillPercent";
import { parseHeightCmOptionalInput } from "./profileHeightCm";
import { PROFILE_MIN_VISIBLE_AGE } from "./profileAge";

export type OnboardingFillCriterion = {
  key: string;
  label: string;
  ok: boolean;
  points: number;
  maxPoints: number;
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

/** Détail des points du pourcentage affiché (≠ garde finale Discover). */
export function buildOnboardingFillPercentBreakdown(
  s: OnboardingFillSnapshot,
): { total: number; criteria: OnboardingFillCriterion[] } {
  const criteria: OnboardingFillCriterion[] = [];

  const push = (key: string, label: string, ok: boolean, points: number, maxPoints: number) => {
    criteria.push({ key, label, ok, points: ok ? points : 0, maxPoints });
  };

  push("first_name", "Prénom", s.firstName.trim().length >= 1, 6, 6);
  push("birth_date_adult", "Âge (date + 18+)", Boolean(s.birthDate && isAdultFromBirthIso(s.birthDate)), 9, 9);
  push("gender", "Sexe / genre", s.gender.trim() !== "", 6, 6);
  push("interested_in", "Personnes recherchées", s.interestedIn.length > 0, 6, 6);
  push("intent", "Intention (que cherches-tu)", s.intent.trim() !== "", 6, 6);
  push(
    "preferred_age",
    "Tranche d’âge souhaitée",
    preferredAgeOk(s.preferredAgeMinStr, s.preferredAgeMaxStr),
    5,
    5,
  );
  push("height_cm", "Taille", parseHeightCmOptionalInput(s.heightCmInput) != null, 5, 5);

  const locOk =
    s.city.trim().length >= 2 &&
    typeof s.lat === "number" &&
    Number.isFinite(s.lat) &&
    typeof s.lng === "number" &&
    Number.isFinite(s.lng) &&
    isValidDiscoveryRadiusKm(s.radiusKm);
  push("location", "Ville + coordonnées + rayon", locOk, 10, 10);

  const nSports = s.sportIds.length;
  const sportsCountOk = nSports >= 1 && nSports <= 3;
  push("sports_count", "1 à 3 sports", sportsCountOk, 8, 8);
  const levelsOk = sportsCountOk && s.sportIds.every((id) => Boolean(s.sportLevelsById[String(id)]?.trim()));
  push("sport_levels", "Niveau par sport", levelsOk, 6, 6);

  const hasPortrait = Boolean(s.portraitSavedUrl.trim()) || s.hasPortraitFile;
  const hasBody = Boolean(s.bodySavedUrl.trim()) || s.hasBodyFile;
  push("photo_face", "Photo visage", hasPortrait, 9, 9);
  push("photo_activity", "Photo activité", hasBody, 9, 9);

  push("confirm_18", "Confirmation 18+", s.confirm18, 4, 4);
  push("accept_terms", "CGU acceptées", s.acceptTerms, 4, 4);
  push("open_to_adapted", "Ouverture pratique adaptée", s.openToAdaptedPractice.trim() !== "", 5, 5);

  const phrase = (s.optionalPhrase ?? "").trim();
  push("optional_phrase", "Bio / phrase sport (≥ 8 car., optionnel)", phrase.length >= 8, 2, 2);

  const total = computeOnboardingProfileFillPercent(s);
  return { total, criteria };
}

export type CanSubmitCheck = { key: string; label: string; ok: boolean };

export function buildCanSubmitChecks(input: {
  firstName: string;
  birthDate: string;
  onboardingPreferredAgeDraftOk: boolean;
  gender: string;
  interestedInLength: number;
  intent: string;
  locationReady: boolean;
  selectedSportIds: string[];
  sportLevelsById: Record<string, string | undefined>;
  openToAdaptedPractice: string;
  portraitSavedUrl: string;
  portraitFile: File | null;
  bodySavedUrl: string;
  bodyFile: File | null;
  confirm18: boolean;
  acceptTerms: boolean;
}): CanSubmitCheck[] {
  return [
    { key: "first_name", label: "Prénom", ok: input.firstName.trim() !== "" },
    { key: "birth_date", label: "Date de naissance", ok: input.birthDate !== "" },
    { key: "adult", label: "18 ans ou plus", ok: isAdultFromBirthIso(input.birthDate) },
    { key: "preferred_age", label: "Tranche d’âge souhaitée", ok: input.onboardingPreferredAgeDraftOk },
    { key: "gender", label: "Genre", ok: input.gender !== "" },
    { key: "interested_in", label: "Personnes recherchées", ok: input.interestedInLength > 0 },
    { key: "intent", label: "Intention", ok: input.intent !== "" },
    { key: "location", label: "Localisation complète", ok: input.locationReady },
    {
      key: "sports_min",
      label: "Au moins 1 sport",
      ok: input.selectedSportIds.length >= 1,
    },
    {
      key: "sports_max",
      label: "Max 3 sports",
      ok: input.selectedSportIds.length <= 3,
    },
    {
      key: "sport_levels",
      label: "Niveau pour chaque sport",
      ok: input.selectedSportIds.every((id) => Boolean(input.sportLevelsById[String(id)])),
    },
    {
      key: "open_to_adapted",
      label: "Ouverture pratique adaptée",
      ok: input.openToAdaptedPractice !== "",
    },
    {
      key: "photo_face",
      label: "Photo visage (fichier ou URL enregistrée)",
      ok: input.portraitSavedUrl.trim() !== "" || input.portraitFile != null,
    },
    {
      key: "photo_activity",
      label: "Photo activité (fichier ou URL enregistrée)",
      ok: input.bodySavedUrl.trim() !== "" || input.bodyFile != null,
    },
    { key: "confirm_18", label: "Case 18+", ok: input.confirm18 },
    { key: "accept_terms", label: "CGU", ok: input.acceptTerms },
  ];
}

export function logOnboardingFinalValidationDiagnostics(opts: {
  phase: string;
  fillSnapshot: OnboardingFillSnapshot;
  canSubmitChecks: CanSubmitCheck[];
  canSubmit: boolean;
  profilePayloadForAudit?: Record<string, unknown>;
  profileSportsRowCount?: number;
  blockReason?: string | null;
  extra?: Record<string, unknown>;
}): void {
  if (!import.meta.env.DEV) return;
  const { total, criteria } = buildOnboardingFillPercentBreakdown(opts.fillSnapshot);
  const failedFill = criteria.filter((c) => !c.ok);
  const failedCanSubmit = opts.canSubmitChecks.filter((c) => !c.ok);

  const audit =
    opts.profilePayloadForAudit != null
      ? auditProfileCriticalDataForDiscover(
          opts.profilePayloadForAudit,
          opts.profileSportsRowCount ?? 0,
        )
      : null;

  const gaps =
    opts.profilePayloadForAudit != null
      ? collectProfileCriticalDataGaps(
          opts.profilePayloadForAudit,
          opts.profileSportsRowCount ?? 0,
        )
      : [];

  console.group(`[Onboarding validation] ${opts.phase}`);
  const facePhotoUrl = opts.fillSnapshot.portraitSavedUrl.trim() || null;
  const activityPhotoUrl = opts.fillSnapshot.bodySavedUrl.trim() || null;
  console.log("fill_percent_displayed", total, {
    facePhotoUrl,
    activityPhotoUrl,
    hasPortraitFile: opts.fillSnapshot.hasPortraitFile,
    hasBodyFile: opts.fillSnapshot.hasBodyFile,
    note:
      total === 98
        ? "Souvent il ne manque que la phrase sport optionnelle (2 pts, ≥ 8 car.) — ce n’est PAS bloquant pour valider si canSubmit=true."
        : total < 100 && total >= 96
          ? "Vérifier photo_face / photo_activity dans le tableau ci-dessous."
          : undefined,
  });
  console.table(
    criteria.map((c) => ({
      critère: c.label,
      ok: c.ok,
      points: `${c.points}/${c.maxPoints}`,
    })),
  );
  if (failedFill.length > 0) {
    console.log("fill_percent_missing_points", failedFill.map((c) => c.label));
  }

  console.log("canSubmit", opts.canSubmit);
  console.table(
    opts.canSubmitChecks.map((c) => ({
      condition: c.label,
      ok: c.ok,
    })),
  );
  if (failedCanSubmit.length > 0) {
    console.warn("canSubmit_BLOCKERS", failedCanSubmit.map((c) => c.key));
  }

  if (opts.profilePayloadForAudit) {
    console.log("auditProfileCriticalDataForDiscover", audit);
    if (gaps.length > 0) {
      console.warn("discover_critical_gaps", gaps);
    }
    console.log("payload_audit_snapshot", {
      portrait_url: opts.profilePayloadForAudit.portrait_url ?? null,
      fullbody_url: opts.profilePayloadForAudit.fullbody_url ?? null,
      main_photo_url: opts.profilePayloadForAudit.main_photo_url ?? null,
      gender: opts.profilePayloadForAudit.gender ?? null,
      looking_for: opts.profilePayloadForAudit.looking_for ?? null,
      city: opts.profilePayloadForAudit.city ?? null,
      latitude: opts.profilePayloadForAudit.latitude ?? null,
      longitude: opts.profilePayloadForAudit.longitude ?? null,
      discovery_radius_km: opts.profilePayloadForAudit.discovery_radius_km ?? null,
      sport_match_preference: opts.profilePayloadForAudit.sport_match_preference ?? null,
      onboarding_sports_count: opts.profilePayloadForAudit.onboarding_sports_count ?? null,
    });
  }

  if (opts.blockReason) {
    console.error("VALIDATION_REFUSED_REASON", opts.blockReason, {
      facePhotoUrl,
      activityPhotoUrl,
      fill_percent_at_block: total,
      canSubmit_blockers: failedCanSubmit.map((c) => c.key),
      discover_gaps: gaps,
    });
  }
  if (opts.extra) {
    console.log("extra", opts.extra);
  }
  console.groupEnd();
}
