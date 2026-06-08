import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Accessibility } from "lucide-react";
import { supabase } from "../lib/supabase";
import { env } from "../lib/env";
import { useAuth } from "../contexts/AuthContext";
import { GlobalHeader } from "../components/GlobalHeader";
import { SplashScreen } from "../components/SplashScreen";
import { isAdultFromBirthIso } from "../lib/ageGate";
import {
  mergeOptionalProfileFields,
  ONBOARDING_PROFILE_HYDRATE_TIERS,
  PROFILE_UPSERT_ONBOARDING_SELECT,
  PROFILE_UPSERT_ONBOARDING_SELECT_CORE,
  isUndefinedColumnError,
  selectProfilesFirstMatch,
} from "../lib/profileSelect";
import { mergeAdaptedOpennessFields } from "../lib/profileAdaptedOpenness";
import { isProfileRecord } from "../lib/appProfile";
import {
  type CitySearchSuggestion,
  formatCitySuggestionListLabel,
  reverseGeocodeCity,
  searchCitiesApprox,
} from "../lib/geocoding";
import { formatCityDisplay, normalizePrimaryLocalityLabel, normalizeProfileCityForStorage } from "../lib/formatCityDisplay";
import { clearOnboardingUiLocalCache } from "../lib/onboardingUiLocalCache";
import { offerPushNotificationsAfterOnboarding } from "../lib/pushNotifications";
import { getCurrentPositionCoords } from "../utils/geolocation";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import { PHOTO_VERIFICATION_PLACEHOLDER } from "../constants";
import { profilePhotoStoragePathFromPublicUrl } from "../lib/profilePhotoStoragePath";
import { photoModerationHeadline, photoModerationRejectedDetail } from "../lib/photoModerationUi";
import { invokeModeratePhoto } from "../services/photoModeration.service";
import type { PhotoModerationStatus } from "../types/photoModeration.types";
import { useTranslation } from "../i18n/useTranslation";
import { antiExitValidator } from "../lib/antiExitValidator";
import {
  parseHeightCmOptionalInput,
  PROFILE_HEIGHT_CM_MAX,
  PROFILE_HEIGHT_CM_MIN,
} from "../lib/profileHeightCm";
import { stashPendingReferralCodeFromSearch, tryCompletePendingReferral } from "../services/referral.service";
import {
  DEFAULT_PREFERRED_AGE_MAX,
  DEFAULT_PREFERRED_AGE_MIN,
  PROFILE_MIN_VISIBLE_AGE,
  normalizePreferredAgeRange,
} from "../lib/profileAge";
import { parseSportMatchPreference, type SportMatchPreferenceDb } from "../lib/sportMatchPreference";
import {
  auditOnboardingProfileForDiscover,
  auditProfileCriticalDataForDiscover,
  computeStrictCompletionFlags,
  isProfileReadyForDiscover,
  messageForDiscoverReadinessGap,
} from "../lib/onboardingDiscoverReadiness";
import {
  computeOnboardingProfileFillPercent,
  type OnboardingFillSnapshot,
} from "../lib/onboardingProfileFillPercent";
import {
  buildCanSubmitChecks,
  logOnboardingFinalValidationDiagnostics,
} from "../lib/onboardingProfileValidationDebug";
import {
  normalizeProfilePhotoStoredRef,
  resolveProfilePhotoDisplayUrl,
  uploadProfilePhoto,
} from "../lib/profilePhotoUpload";
import { SPLovePhotoLog } from "../lib/profilePhotoPipelineLog";
import { PhotoFlowLog } from "../lib/photoFlowLog";
import { fetchProfileScreenFields, mergeProfileScreenRowPreservingPhotos } from "../lib/profileScreenHydrate";
import {
  ensureOnboardingCompletionInProfile,
  fetchProfileAfterOnboardingSubmit,
  mergeProfileRowPreservingCompletion,
  profileRowOnboardingComplete,
} from "../lib/onboardingCompletion";
import { OnboardingFlowLog } from "../lib/onboardingFlowLog";
import { clearProfilePhotoResolutionCache } from "../hooks/useProfilePhotoSignedUrl";
import {
  type EnergyOptionKey,
  normalizeIntensityForOnboardingHydrate,
  type OnboardingVariant,
  onboardingVariantFromProfile,
} from "../lib/onboardingEnergyOptions";
import {
  orderedQuickPickSports,
  sportMatchesFirstThreeLetters,
  sportPictogramForSlug,
} from "../lib/onboardingSportsQuickPick";

function isSafePhotoPreviewSrc(src: string | null | undefined): boolean {
  const value = typeof src === "string" ? src.trim() : "";
  if (!value) return false;
  if (value.includes("[redacted")) return false;
  return true;
}

function pickOnboardingPhotoPreviewSrc(
  localPersisted: string | null,
  fileObjectUrl: string | null,
  remoteResolved: string | null,
): string | null {
  for (const candidate of [localPersisted, fileObjectUrl, remoteResolved]) {
    if (isSafePhotoPreviewSrc(candidate)) return candidate;
  }
  return null;
}

function revokeObjectUrlSafe(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

const genderOptions = [
  { value: "male", label: "gender.male" },
  { value: "female", label: "gender.female" },
  { value: "trans_male", label: "gender.trans_male" },
  { value: "trans_female", label: "gender.trans_female" },
  { value: "non_binary", label: "gender.non_binary" },
];

const INTERESTED_IN_OPTIONS = [
  { value: "men", label: "gender_preference.men" },
  { value: "women", label: "gender_preference.women" },
  { value: "trans_men", label: "gender_preference.trans_men" },
  { value: "trans_women", label: "gender_preference.trans_women" },
  { value: "non_binary", label: "gender_preference.non_binary" },
  { value: "all", label: "gender_preference.everyone" },
] as const;
const INTERESTED_IN_ALL_VALUE = "all";
type InterestedInValue = (typeof INTERESTED_IN_OPTIONS)[number]["value"];

/** « Tous » conservé en données ; masqué en UI pour privilégier des choix explicites. */
const INTERESTED_IN_OPTIONS_UI = INTERESTED_IN_OPTIONS.filter((o) => o.value !== INTERESTED_IN_ALL_VALUE);

function normalizeInterestedInValues(raw: unknown): InterestedInValue[] {
  const mapLegacy = (v: string): InterestedInValue | "" => {
    const n = v.trim().toLowerCase();
    if (n === "femme" || n === "femmes" || n === "women") return "women";
    if (n === "homme" || n === "hommes" || n === "men") return "men";
    if (n === "femme trans" || n === "femmes trans" || n === "trans_women") return "trans_women";
    if (n === "homme trans" || n === "hommes trans" || n === "trans_men") return "trans_men";
    if (n === "non-binaire" || n === "non binaires" || n === "non_binary") return "non_binary";
    if (n === "tous" || n === "all") return "all";
    return "";
  };
  const source = Array.isArray(raw)
    ? raw.map((x) => String(x ?? ""))
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const out: InterestedInValue[] = [];
  for (const item of source) {
    const mapped = mapLegacy(item);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  if (out.includes(INTERESTED_IN_ALL_VALUE)) return [INTERESTED_IN_ALL_VALUE];
  return out;
}

function serializeInterestedInValues(values: InterestedInValue[]): string | null {
  if (values.length === 0) return null;
  // TODO(db): if `profiles.looking_for` becomes text[]/jsonb, store this array directly.
  return values.join(",");
}

/** Valeurs `profiles.planning_style` — rétention BDD / brouillon ; plus d’étape dédiée en onboarding. */
type PlanningStyleValue = "spontaneous" | "planned" | "both";

/** Valeurs acceptées en BDD (`unsure` conservé pour rétro-compat — option masquée en UI). */
const OPEN_TO_ADAPTED_VALUES = ["yes_totally", "yes_depends_sport", "unsure", "no"] as const;
type OpenToAdaptedPractice = (typeof OPEN_TO_ADAPTED_VALUES)[number];

const HAS_CHILDREN_VALUES = ["yes", "no", "prefer_not"] as const;
type HasChildrenChoice = "" | (typeof HAS_CHILDREN_VALUES)[number];

function hasChildrenForDb(choice: HasChildrenChoice): boolean | null {
  if (choice === "yes") return true;
  if (choice === "no") return false;
  return null;
}

function hasChildrenFromProfile(raw: unknown): HasChildrenChoice {
  if (raw === true) return "yes";
  if (raw === false) return "no";
  return "";
}

type AdaptedPracticeAmenagements = "" | "yes" | "no" | "prefer_not";

function needsAdaptedActivitiesForDb(am: AdaptedPracticeAmenagements): boolean | null {
  if (am === "yes") return true;
  if (am === "no") return false;
  return null;
}

function parseHydratedOpenToAdapted(raw: unknown): OpenToAdaptedPractice | "" {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (OPEN_TO_ADAPTED_VALUES as readonly string[]).includes(s) ? (s as OpenToAdaptedPractice) : "";
}

function preferredAgeFromDraftInputs(minStr: string, maxStr: string): { min: number; max: number } {
  const amin = Number.parseInt(minStr.trim(), 10);
  const amax = Number.parseInt(maxStr.trim(), 10);
  return normalizePreferredAgeRange(
    Number.isFinite(amin) ? amin : DEFAULT_PREFERRED_AGE_MIN,
    Number.isFinite(amax) ? amax : DEFAULT_PREFERRED_AGE_MAX,
  );
}

function hydratePreferredAgeStringsFromProfileRow(row: Record<string, unknown>): { minStr: string; maxStr: string } {
  const readN = (key: string, fb: number) => {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && v.trim()) {
      const n = Number.parseInt(v.trim(), 10);
      return Number.isFinite(n) ? n : fb;
    }
    return fb;
  };
  const r = normalizePreferredAgeRange(
    readN("preferred_age_min", DEFAULT_PREFERRED_AGE_MIN),
    readN("preferred_age_max", DEFAULT_PREFERRED_AGE_MAX),
  );
  return { minStr: String(r.min), maxStr: String(r.max) };
}

/** Hydrate Q1 uniquement si Q2 déjà renseignée (évite d’inferer un « Non » sur profils anciens). */
function adaptedAmenagementsFromProfile(
  needs: unknown,
  openToRaw: unknown
): AdaptedPracticeAmenagements {
  if (parseHydratedOpenToAdapted(openToRaw) === "") return "";
  if (needs === true) return "yes";
  if (needs === false) return "no";
  return "prefer_not";
}

const OPTIONAL_PROFILE_COLUMNS = [
  "onboarding_sports_count",
  "onboarding_sports_with_level_count",
  "location_source",
  "sport_intensity",
  "meet_vibe",
  "planning_style",
  "open_to_adapted_activities",
  "height_cm",
  "has_children",
  "preferred_age_min",
  "preferred_age_max",
  "sport_match_preference",
  "language",
  "accepted_terms_at",
  "accepted_privacy_at",
] as const;

function isMissingOptionalProfileColumnError(
  error: { code?: string | number; message?: string } | null | undefined,
  columnName: (typeof OPTIONAL_PROFILE_COLUMNS)[number]
): boolean {
  return isUndefinedColumnError(error, columnName);
}

function getMissingOptionalProfileColumns(
  error: { code?: string | number; message?: string } | null | undefined
): (typeof OPTIONAL_PROFILE_COLUMNS)[number][] {
  return OPTIONAL_PROFILE_COLUMNS.filter((columnName) =>
    isMissingOptionalProfileColumnError(error, columnName)
  );
}

function stripOptionalProfileColumnsFromPayload(
  payload: Record<string, unknown>,
  columns: readonly (typeof OPTIONAL_PROFILE_COLUMNS)[number][]
): Record<string, unknown> {
  const next = { ...payload };
  for (const columnName of columns) {
    delete (next as Record<string, unknown>)[columnName];
  }
  return next;
}

/** Profils 063 avec `profile_completed` + `onboarding_completed` mais `onboarding_done` absent / false — à corriger en BDD. */
function profileRowNeedsOnboardingDoneBackfill(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    r.profile_completed === true &&
    r.onboarding_completed === true &&
    r.onboarding_done !== true
  );
}

function stripOptionalColumnsFromSelect(select: string): string {
  const optional = new Set<string>(OPTIONAL_PROFILE_COLUMNS);
  return select
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !optional.has(part))
    .join(", ");
}

function extractFaultyColumnNameFromPostgrestMessage(message: string | undefined): string | null {
  if (!message) return null;
  const m =
    message.match(/Could not find the '([^']+)' column/i) ??
    message.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
  return m?.[1] ?? null;
}

/** Ordre de retrait défensif + mapping legacy (schéma mixte prod). Les colonnes photo canoniques ne sont jamais retirées ici. */
const PROD_SANITIZE_AGGRESSIVE_STRIP_ORDER = ["practice_preferences", "sport_time"] as const;

/** Jamais retirées du payload upsert — même si PostgREST signale une colonne absente (mapping legacy à la place). */
const PROTECTED_PROFILE_PHOTO_COLUMNS = new Set([
  "portrait_url",
  "fullbody_url",
  "main_photo_url",
  "avatar_url",
]);

type ProdPayloadSanitizeContext = {
  interestedIn: string;
  sportTime: string;
  practicePreferences: string[];
  portraitUrl: string;
  fullbodyUrl: string;
};

function applyLegacyMappingAfterRemoval(
  removedKey: string,
  next: Record<string, unknown>,
  ctx: ProdPayloadSanitizeContext
): void {
  switch (removedKey) {
    case "practice_preferences":
      next.accessibility_tags = ctx.practicePreferences;
      break;
    case "looking_for":
      next.interested_in = ctx.interestedIn;
      break;
    case "sport_time":
      next.sport_time_pref = ctx.sportTime || null;
      break;
    case "portrait_url":
      next.avatar_url = ctx.portraitUrl;
      break;
    case "fullbody_url":
      next.photo2_path = ctx.fullbodyUrl;
      break;
    case "main_photo_url":
      if (next.avatar_url == null || String(next.avatar_url).trim() === "") {
        next.avatar_url = ctx.portraitUrl;
      }
      break;
    default:
      break;
  }
}

/**
 * Retire une colonne faute (message PostgREST) ou une colonne « risquée » par phase agressive,
 * puis applique le mapping legacy quand c’est pertinent.
 */
function sanitizeProfilesPayloadForProd(
  payload: Record<string, unknown>,
  errorMessage: string | undefined,
  ctx: ProdPayloadSanitizeContext,
  aggressivePhase: number
): Record<string, unknown> {
  const next = { ...payload };
  if (aggressivePhase < 0) {
    const faulty = extractFaultyColumnNameFromPostgrestMessage(errorMessage);
    if (faulty && !PROTECTED_PROFILE_PHOTO_COLUMNS.has(faulty)) {
      delete next[faulty];
      applyLegacyMappingAfterRemoval(faulty, next, ctx);
    } else if (faulty && PROTECTED_PROFILE_PHOTO_COLUMNS.has(faulty)) {
      applyLegacyMappingAfterRemoval(faulty, next, ctx);
    }
    return reinjectOnboardingPhotoUrlsInPayload(next, ctx);
  }
  const key = PROD_SANITIZE_AGGRESSIVE_STRIP_ORDER[aggressivePhase];
  if (key) {
    delete next[key];
    applyLegacyMappingAfterRemoval(key, next, ctx);
  }
  return reinjectOnboardingPhotoUrlsInPayload(next, ctx);
}

/** Réinjecte les URLs photo canoniques après sanitize / retry upsert. */
function reinjectOnboardingPhotoUrlsInPayload(
  payload: Record<string, unknown>,
  ctx: ProdPayloadSanitizeContext,
): Record<string, unknown> {
  const portrait = normalizeProfilePhotoStoredRef(ctx.portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(ctx.fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) return payload;
  const next = { ...payload };
  if (portrait) {
    next.portrait_url = portrait;
    if (!String(next.avatar_url ?? "").trim()) next.avatar_url = portrait;
  }
  if (fullbody) next.fullbody_url = fullbody;
  next.main_photo_url = portrait || fullbody;
  return next;
}

function profileRowHasCanonicalPhotos(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const portrait = typeof row.portrait_url === "string" ? row.portrait_url.trim() : "";
  const fullbody = typeof row.fullbody_url === "string" ? row.fullbody_url.trim() : "";
  const main = typeof row.main_photo_url === "string" ? row.main_photo_url.trim() : "";
  return portrait.length > 0 || fullbody.length > 0 || main.length > 0;
}

function mergeOnboardingPhotosIntoProfileRow(
  row: Record<string, unknown>,
  portraitUrl: string,
  fullbodyUrl: string,
): Record<string, unknown> {
  const portrait = normalizeProfilePhotoStoredRef(portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) return row;
  const next = { ...row };
  if (portrait) {
    next.portrait_url = portrait;
    if (!String(next.avatar_url ?? "").trim()) next.avatar_url = portrait;
  }
  if (fullbody) next.fullbody_url = fullbody;
  next.main_photo_url = portrait || fullbody;
  return next;
}

/** Écriture dédiée des URLs photo canoniques — indépendante des retries sanitize du gros upsert. */
async function ensureOnboardingPhotosInProfile(
  userId: string,
  portraitUrl: string,
  fullbodyUrl: string,
  source: string,
): Promise<Record<string, unknown> | null> {
  const portrait = normalizeProfilePhotoStoredRef(portraitUrl, supabase).trim();
  const fullbody = normalizeProfilePhotoStoredRef(fullbodyUrl, supabase).trim();
  if (!portrait && !fullbody) return null;

  SPLovePhotoLog.urlGenerated({
    source,
    userId,
    storedRef: portrait || fullbody,
    displayUrl: portrait || fullbody,
    extra: { hasPortrait: Boolean(portrait), hasFullbody: Boolean(fullbody) },
  });

  const payload: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
    ...(portrait ? { portrait_url: portrait, avatar_url: portrait } : {}),
    ...(fullbody ? { fullbody_url: fullbody } : {}),
    main_photo_url: portrait || fullbody,
  };

  PhotoFlowLog.profilePayloadSent({
    userId,
    source,
    portrait_url: portrait || null,
    fullbody_url: fullbody || null,
    main_photo_url: (portrait || fullbody) || null,
    avatar_url: portrait || null,
  });

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, portrait_url, fullbody_url, main_photo_url, avatar_url")
    .maybeSingle();

  if (error) {
    SPLovePhotoLog.dbSaveError({
      source,
      userId,
      storedRef: portrait || fullbody,
      error: error.message,
    });
    PhotoFlowLog.profileReadback({
      userId,
      source,
      error: error.message,
    });
    console.error("[Onboarding] ensureOnboardingPhotosInProfile failed", { userId, source, error });
    return null;
  }

  const savedRow = (data ?? { id: userId, ...payload }) as Record<string, unknown>;
  PhotoFlowLog.profileReadback({
    userId,
    source,
    portrait_url: typeof savedRow.portrait_url === "string" ? savedRow.portrait_url : null,
    fullbody_url: typeof savedRow.fullbody_url === "string" ? savedRow.fullbody_url : null,
    main_photo_url: typeof savedRow.main_photo_url === "string" ? savedRow.main_photo_url : null,
    avatar_url: typeof savedRow.avatar_url === "string" ? savedRow.avatar_url : null,
  });

  SPLovePhotoLog.dbSaveSuccess({
    source,
    userId,
    storedRef: portrait || fullbody,
    profileRow: (data ?? { id: userId, ...payload }) as Record<string, unknown>,
  });
  PhotoFlowLog.savedToProfile({
    userId,
    profileId: userId,
    photoField: portrait ? "portrait_url" : "fullbody_url",
    storedRef: portrait || fullbody,
    main_photo_url: portrait || fullbody,
    portrait_url: portrait || null,
  });
  clearProfilePhotoResolutionCache();
  return (data ?? { id: userId, ...payload }) as Record<string, unknown>;
}

/** Valeurs BDD existantes (`profiles.intent`) — ne pas casser Discover/Matching. */
const INTENT_DB_AMOUR = "Amoureux";
const INTENT_DB_AMICAL = "Amical";

type OnboardingIntentUiValue = "dating_feeling" | "sport_social" | "both";

type OnboardingIntentCard = {
  uiValue: OnboardingIntentUiValue;
  translationKey: "intention_meet_new_people" | "intention_something_more" | "intention_lets_see";
};

const ONBOARDING_INTENT_CARDS: OnboardingIntentCard[] = [
  { uiValue: "sport_social", translationKey: "intention_meet_new_people" },
  { uiValue: "dating_feeling", translationKey: "intention_something_more" },
  { uiValue: "both", translationKey: "intention_lets_see" },
];

/** Lecture robuste legacy -> carte UI (legacy historique inclus : dating/friendly/both). */
function uiIntentFromDbIntent(dbValue: unknown): OnboardingIntentUiValue | "" {
  if (typeof dbValue !== "string") return "";
  const raw = dbValue.trim();
  if (!raw) return "";
  const norm = raw.toLowerCase();
  if (norm === "friendly" || norm === "amical" || norm === "activity_first") return "sport_social";
  if (norm === "dating" || norm === "amoureux" || norm === "open_to_dating") return "dating_feeling";
  if (norm === "both" || norm === "open") return "both";
  return "";
}

/** Écriture carte UI -> valeur BDD existante (`profiles.intent` : Amical | Amoureux). */
function dbIntentFromUiIntent(uiValue: string): string {
  if (uiValue === "sport_social") return INTENT_DB_AMICAL;
  if (uiValue === "dating_feeling" || uiValue === "both") return INTENT_DB_AMOUR;
  return "";
}

type SportOption = {
  id: string | number;
  name: string;
  slug?: string | null;
  category?: string | null;
  active?: boolean;
  is_featured?: boolean;
};

/** 11 étapes formulaire ; succès onboarding → redirection `/discover`. */
const TOTAL_STEPS = 11;
const ONBOARDING_SPORT_SLOT_MAX = 3;

function onboardingPulseKey(s: number): string {
  const step = Math.min(Math.max(Math.floor(s), 1), TOTAL_STEPS);
  return `onboarding_pulse_step_${step}`;
}

const ONBOARDING_RADIUS_KM_OPTIONS = [10, 25, 50, 100] as const;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPT_MIMES = new Set(["image/jpeg", "image/png"]);
const ONBOARDING_PHOTO_MAX_MB = Math.round(PHOTO_MAX_BYTES / (1024 * 1024));

function onboardingPhotoSlotFilled(savedUrl: string, file: File | null): boolean {
  return savedUrl.trim() !== "" || file != null;
}

function countOnboardingPhotoSlots(
  portraitSavedUrl: string,
  portraitFile: File | null,
  bodySavedUrl: string,
  bodyFile: File | null,
): number {
  let count = 0;
  if (onboardingPhotoSlotFilled(portraitSavedUrl, portraitFile)) count += 1;
  if (onboardingPhotoSlotFilled(bodySavedUrl, bodyFile)) count += 1;
  return count;
}

const ONBOARDING_SPORT_MATCH_OPTIONS: readonly {
  value: SportMatchPreferenceDb;
  labelKey: string;
  descKey: string;
}[] = [
  { value: "same_sports", labelKey: "sport_match_pref_same_label", descKey: "sport_match_pref_same_desc" },
  {
    value: "open_to_different_sports",
    labelKey: "sport_match_pref_open_label",
    descKey: "sport_match_pref_open_desc",
  },
  { value: "both", labelKey: "sport_match_pref_both_label", descKey: "sport_match_pref_both_desc" },
];

const BIRTH_YEAR_MIN = 1900;

/** Extrait jusqu’à 8 chiffres en ordre JJ MM AAAA (saisie ou collage « 22/05/1983 »). */
function birthDigitsFromRaw(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}${iso[2]}${iso[1]}`.slice(0, 8);
  }
  return raw.replace(/\D/g, "").slice(0, 8);
}

/** Slashs automatiques + zéros gauche dès qu’un segment jour/mois est complet. */
function formatBirthDisplay(digits: string): string {
  const len = digits.length;
  if (len === 0) return "";
  if (len <= 2) return digits;
  const dayPart = digits.slice(0, 2).padStart(2, "0");
  if (len <= 4) {
    const monthPart = digits.slice(2, len);
    return len === 4 ? `${dayPart}/${monthPart.padStart(2, "0")}` : `${dayPart}/${monthPart}`;
  }
  const monthPart = digits.slice(2, 4).padStart(2, "0");
  const yearPart = digits.slice(4, Math.min(8, len));
  return `${dayPart}/${monthPart}/${yearPart}`;
}

/** 8 chiffres JJMMYYYY + contrôle calendaire → `YYYY-MM-DD` pour BDD / `isAdultFromBirthIso`. */
function tryParseBirthIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const dd = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const yyyy = parseInt(digits.slice(4, 8), 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  const thisYear = new Date().getFullYear();
  if (yyyy < BIRTH_YEAR_MIN || yyyy > thisYear) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

const inputClassName =
  "w-full box-border rounded-2xl border border-app-border bg-app-bg py-3 px-3.5 text-base text-app-text placeholder:text-app-muted outline-none transition-[border-color,box-shadow] focus:border-app-accent/45 focus:ring-2 focus:ring-app-accent/15";

const labelClassName = "mb-2 block text-sm font-semibold text-app-text tracking-tight";

export default function Onboarding() {
  const { t, language, setLanguage } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user,
    profile,
    isProfileComplete,
    isLoading: authLoading,
    isAuthInitialized,
    isProfileLoading,
    refetchProfile,
    commitProfileRow,
    syncAuthSession,
  } = useAuth();

  console.log("[ReactGuard] onboarding render start");

  const [step, setStep] = useState(1);
  /** Sous-étapes de l’étape 1 — une question principale par micro-écran. */
  const [step1SubStep, setStep1SubStep] = useState(0);

  const [sportSearch, setSportSearch] = useState("");
  const [stepHint, setStepHint] = useState<string | null>(null);
  const [photoStepError, setPhotoStepError] = useState<string | null>(null);
  const [moderationSuccessNote, setModerationSuccessNote] = useState<string | null>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);
  /** Évite la redirection /auth pendant le submit final (race `user` / getSession). */
  const onboardingSubmitInFlightRef = useRef(false);

  const [firstName, setFirstName] = useState("");
  /** Affichage libre JJ/MM/AAAA (saisie continue). */
  const [birthInput, setBirthInput] = useState("");
  /** ISO `YYYY-MM-DD` uniquement si la date est complète et valide. */
  const [birthDate, setBirthDate] = useState("");
  const [obPreferredAgeMinStr, setObPreferredAgeMinStr] = useState(
    String(DEFAULT_PREFERRED_AGE_MIN),
  );
  const [obPreferredAgeMaxStr, setObPreferredAgeMaxStr] = useState(
    String(DEFAULT_PREFERRED_AGE_MAX),
  );
  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState<InterestedInValue[]>([]);
  const [intent, setIntent] = useState<OnboardingIntentUiValue | "">("");
  const [obLocCity, setObLocCity] = useState("");
  const [obLocRadiusKm, setObLocRadiusKm] = useState<number>(25);
  const [obLocLat, setObLocLat] = useState<number | null>(null);
  const [obLocLng, setObLocLng] = useState<number | null>(null);
  const [obLocSource, setObLocSource] = useState<"manual" | "device" | null>(null);
  const [obLocGeoLoading, setObLocGeoLoading] = useState(false);
  const [obCitySuggestions, setObCitySuggestions] = useState<CitySearchSuggestion[]>([]);
  const [obCitySuggestLoading, setObCitySuggestLoading] = useState(false);
  const [sportsCatalog, setSportsCatalog] = useState<SportOption[]>([]);
  const [selectedSportIds, setSelectedSportIds] = useState<(string | number)[]>([]);
  const [selectedSports, setSelectedSports] = useState<SportOption[]>([]);
  const [sportLevelsById, setSportLevelsById] = useState<Record<string, string>>({});
  const [sportMatchPreference, setSportMatchPreference] = useState<SportMatchPreferenceDb>("same_sports");
  const [sportTime, setSportTime] = useState("");
  const [sportMotivations, setSportMotivations] = useState<string[]>([]);
  const [onboardingVariant, setOnboardingVariant] = useState<OnboardingVariant>("A");
  const [sportIntensity, setSportIntensity] = useState<"" | EnergyOptionKey>("");
  const [planningStyle, setPlanningStyle] = useState<"" | PlanningStyleValue>("");
  const [heightCmInput, setHeightCmInput] = useState("");
  const [hasChildrenChoice, setHasChildrenChoice] = useState<HasChildrenChoice>("");
  const [sportPhraseOptional, setSportPhraseOptional] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [bodyFile, setBodyFile] = useState<File | null>(null);
  const [portraitLocalPreviewUrl, setPortraitLocalPreviewUrl] = useState<string | null>(null);
  const [bodyLocalPreviewUrl, setBodyLocalPreviewUrl] = useState<string | null>(null);
  const [portraitSavedUrl, setPortraitSavedUrl] = useState("");
  const [bodySavedUrl, setBodySavedUrl] = useState("");
  const [portraitDisplayResolved, setPortraitDisplayResolved] = useState<string | null>(null);
  const [bodyDisplayResolved, setBodyDisplayResolved] = useState<string | null>(null);
  const [portraitPreviewLoadFailed, setPortraitPreviewLoadFailed] = useState(false);
  const [bodyPreviewLoadFailed, setBodyPreviewLoadFailed] = useState(false);
  const [photoUploadingKind, setPhotoUploadingKind] = useState<null | "portrait" | "body">(null);
  const [practicePreferences, setPracticePreferences] = useState<string[]>([]);
  const [adaptedAmenagements, setAdaptedAmenagements] = useState<AdaptedPracticeAmenagements>("");
  const [openToAdaptedPractice, setOpenToAdaptedPractice] = useState<OpenToAdaptedPractice | "">("");
  const [confirm18, setConfirm18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingSports, setLoadingSports] = useState(true);
  const [sportsLoadError, setSportsLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionalProfileWarning, setOptionalProfileWarning] = useState<string | null>(null);
  const [hydratingDraft, setHydratingDraft] = useState(false);
  const [photoStepDraftSaving, setPhotoStepDraftSaving] = useState(false);
  const hydratedDraftRef = useRef(false);

  useEffect(() => {
    stashPendingReferralCodeFromSearch(searchParams.get("ref"));
  }, [searchParams]);

  useEffect(() => {
    console.log("Onboarding variant:", onboardingVariant);
  }, [onboardingVariant]);

  useEffect(() => {
    if (step !== 4) {
      setObCitySuggestions([]);
      return;
    }
    const q = obLocCity.trim();
    if (q.length < 3) {
      setObCitySuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setObCitySuggestLoading(true);
        try {
          const rows = await searchCitiesApprox(q);
          setObCitySuggestions(rows);
        } finally {
          setObCitySuggestLoading(false);
        }
      })();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [obLocCity, step]);

  function logDetailedError(
    step: string,
    error: unknown,
    extra?: Record<string, unknown>
  ): void {
    const maybe = error as {
      message?: string;
      code?: string | number;
      details?: string;
      hint?: string;
    } | null;
    console.error("[Onboarding submit] error:", {
      step,
      ...extra,
      message: maybe?.message,
      code: maybe?.code,
      details: maybe?.details,
      hint: maybe?.hint,
      error,
    });
  }

  const SPORTS_FETCH_TIMEOUT_MS = 2_000;

  async function saveOnboardingDraft(currentStep: number): Promise<void> {
    if (!user?.id) return;
    const userId = user.id;
    try {
      const formDataSnapshot = {
        first_name: firstName.trim() || null,
        birth_date: birthDate || null,
        gender: gender || null,
        looking_for: serializeInterestedInValues(interestedIn),
        meet_pref: intent ? dbIntentFromUiIntent(intent) : null,
        intent: intent ? dbIntentFromUiIntent(intent) : null,
        city: normalizeProfileCityForStorage(obLocCity) ?? null,
        selectedSports: selectedSports.map((s) => s.name),
        portrait_url: portraitSavedUrl || null,
        fullbody_url: bodySavedUrl || null,
      };
      if (import.meta.env.DEV) {
        console.log("STEP_SAVE_START", currentStep, formDataSnapshot);
      }
      const nowIso = new Date().toISOString();
      const payload: Record<string, unknown> = {
        id: userId,
        updated_at: nowIso,
      };
      if (currentStep >= 1) {
        payload.first_name = firstName.trim() || null;
        payload.birth_date = birthDate || null;
        payload.gender = gender || null;
        payload.looking_for = serializeInterestedInValues(interestedIn);
        const heightCm = parseHeightCmOptionalInput(heightCmInput);
        payload.height_cm = heightCm;
        payload.has_children = hasChildrenForDb(hasChildrenChoice);
        const pa = preferredAgeFromDraftInputs(obPreferredAgeMinStr, obPreferredAgeMaxStr);
        payload.preferred_age_min = pa.min;
        payload.preferred_age_max = pa.max;
      }
      if (currentStep >= 4) {
        const dbIntent = intent ? dbIntentFromUiIntent(intent) : null;
        payload.intent = dbIntent;
        payload.meet_pref = dbIntent;
      }
      if (currentStep >= 2) {
        payload.city = normalizeProfileCityForStorage(obLocCity);
        payload.latitude = obLocLat;
        payload.longitude = obLocLng;
        payload.discovery_radius_km = obLocRadiusKm;
        payload.location_source = (obLocSource ?? (obLocCity.trim() ? "manual" : null)) as
          | "manual"
          | "device"
          | null;
        payload.location_updated_at = nowIso;
      }
      if (currentStep >= 8) {
        payload.needs_adapted_activities = needsAdaptedActivitiesForDb(adaptedAmenagements);
        if (openToAdaptedPractice) {
          payload.open_to_adapted_activities = openToAdaptedPractice;
        }
        payload.sport_time = sportTime || null;
        payload.sport_motivation = sportMotivations.length > 0 ? sportMotivations : null;
        payload.sport_intensity = sportIntensity || null;
        payload.meet_vibe = null;
        payload.planning_style = planningStyle || null;
      }
      if (currentStep >= 9) {
        payload.sport_phrase = sportPhraseOptional.trim() || null;
        payload.portrait_url = portraitSavedUrl.trim() || null;
        payload.fullbody_url = bodySavedUrl.trim() || null;
        payload.main_photo_url = portraitSavedUrl.trim() || bodySavedUrl.trim() || null;
      }
      if (currentStep >= 10) payload.practice_preferences = practicePreferences;
      if (currentStep >= 5) payload.sport_match_preference = sportMatchPreference;
      payload.onboarding_sports_count = selectedSportIds.length;
      payload.onboarding_sports_with_level_count = selectedSportIds.filter((id) => Boolean(sportLevelsById[String(id)])).length;
      if (import.meta.env.DEV) {
        console.log("PROFILE_UPDATE_PAYLOAD", payload);
      }

      let { error: upsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (upsertError) {
        const missingColumns = getMissingOptionalProfileColumns(upsertError);
        if (missingColumns.length > 0) {
          console.warn("[Onboarding draft] optional columns missing, retrying without columns", {
            missingColumns,
            code: upsertError.code,
            message: upsertError.message,
          });
          const fallbackPayload = stripOptionalProfileColumnsFromPayload(payload, missingColumns);
          ({ error: upsertError } = await supabase.from("profiles").upsert(fallbackPayload, {
            onConflict: "id",
          }));
          if (upsertError) {
            console.warn("[Onboarding draft] save fallback failed", upsertError);
          }
        }
      }
      if (upsertError) {
        console.warn("[Onboarding draft] save failed", upsertError);
        console.error("ONBOARDING_SAVE_ERROR", upsertError);
      }

      if (currentStep >= 3) {
        const validSportIds = Array.from(new Set(await resolveSelectedSportIdsForPersistence()));
        console.log("SPORTS_PERSIST_START", selectedSports.map((s) => s.name));
        const { error: delErr } = await supabase.from("profile_sports").delete().eq("profile_id", userId);
        if (delErr) {
          console.warn("[Onboarding draft] profile_sports delete failed", delErr);
          console.error("ONBOARDING_SAVE_ERROR", delErr);
          return;
        }
        if (validSportIds.length > 0) {
          const { error: insErr, data: insData } = await supabase
            .from("profile_sports")
            .insert(
              validSportIds.map((sportId) => ({
                profile_id: userId,
                sport_id: sportId,
                level: sportLevelsById[String(sportId)] ?? null,
              }))
            )
            .select("sport_id");
          if (insErr) {
            console.warn("[Onboarding draft] profile_sports insert failed", insErr);
            console.error("ONBOARDING_SAVE_ERROR", insErr);
          }
          console.log("SPORTS_PERSIST_RESULT", {
            inserted: insData?.length ?? 0,
            ids: validSportIds,
            error: insErr?.message ?? null,
          });
        } else {
          console.log("SPORTS_PERSIST_RESULT", { inserted: 0, ids: [], error: null });
        }
      }
    } catch (draftErr) {
      console.warn("[Onboarding draft] unexpected save error", draftErr);
      console.error("ONBOARDING_SAVE_ERROR", draftErr);
    }
  }

  useEffect(() => {
    let cancelled = false;
    console.log("[Onboarding sports] fetch start");

    async function loadSports() {
      setLoadingSports(true);
      setSportsLoadError(null);
      try {
        const timeoutPromise = new Promise<"timeout">((resolve) => {
          window.setTimeout(() => resolve("timeout"), SPORTS_FETCH_TIMEOUT_MS);
        });

        const queryPromise = (async () => {
          const res = await supabase
            .from("sports")
            .select("id, label, slug, category, active, is_featured")
            .eq("active", true)
            .order("label", { ascending: true });
          return res;
        })();

        const raced = await Promise.race([
          queryPromise.then((r) => ({ kind: "ok" as const, r })),
          timeoutPromise.then(() => ({ kind: "timeout" as const })),
        ]);

        if (cancelled) return;

        if (raced.kind === "timeout") {
          console.warn("[Onboarding sports] fetch result: timeout");
          setSportsCatalog([]);
          setSportsLoadError(t("onboarding_sports_catalog_unavailable"));
          return;
        }

        const { data, error: e } = raced.r;
        console.log("[Onboarding sports] fetch result:", { ok: !e, message: e?.message ?? null });

        if (e) {
          console.error("[Onboarding sports]", e);
          setSportsCatalog([]);
          setSportsLoadError(e.message || t("onboarding_sports_load_failed"));
          return;
        }

        const list = (data ?? []).map((r) => {
          const label = String((r.label as string | null) ?? "").trim();
          const slugRaw = (r as { slug?: string | null }).slug;
          return {
            id: r.id,
            name: label,
            slug: typeof slugRaw === "string" ? slugRaw : null,
            category: (r.category as string | null) ?? null,
            active: r.active === true,
            is_featured: r.is_featured === true,
          };
        });
        setSportsCatalog(list);
        console.log("[Onboarding sports] sports count:", list.length);
        setSportsLoadError(
          list.length > 0
            ? null
            : t("onboarding_sports_catalog_unavailable"),
        );
      } catch (err) {
        console.error("[Onboarding sports] unexpected", err);
        setSportsCatalog([]);
        setSportsLoadError(t("onboarding_sports_unexpected"));
      } finally {
        if (!cancelled) {
          setLoadingSports(false);
          console.log("[Onboarding sports] loading:", false);
        }
      }
    }

    void loadSports();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (step !== 5) return;
    console.log("[Onboarding sports] mount");
  }, [step]);

  useEffect(() => {
    if (step !== 5) return;
    console.log("[Onboarding sports] loading:", loadingSports);
    console.log("[Onboarding sports] sports count:", sportsCatalog.length);
    console.log("[Onboarding sports] input disabled:", false);
    console.log("[Onboarding sports] selected sports:", selectedSportIds);
    console.log("[Onboarding sports] error:", sportsLoadError ?? error ?? null);
  }, [step, loadingSports, sportsCatalog.length, selectedSportIds, sportsLoadError, error]);

  useEffect(() => {
    if (!user?.id || authLoading || isProfileComplete || hydratedDraftRef.current) return;
    const userId = user.id;
    let cancelled = false;
    async function hydrateDraft() {
      setHydratingDraft(true);
      try {
        const { data: p, usedSelect } = await selectProfilesFirstMatch(
          supabase,
          userId,
          ONBOARDING_PROFILE_HYDRATE_TIERS,
          "[Onboarding draft] hydrate",
        );
        if (!p) {
          console.warn("[Onboarding draft] hydrate: no data from any tier (schema/empty profile)");
          return;
        }
        console.debug("[Onboarding draft] hydrate OK", { usedSelectSample: usedSelect?.slice(0, 90) });
        if (cancelled || !p || typeof p !== "object") return;
        const row = p as Record<string, unknown>;
        Object.assign(row, await mergeOptionalProfileFields(supabase, userId));
        Object.assign(row, await mergeAdaptedOpennessFields(supabase, userId));
        const profLang = row.language;
        if (profLang === "fr" || profLang === "en") {
          setLanguage(profLang);
        }
        setFirstName(String(row.first_name ?? ""));
        const isoBirth = typeof row.birth_date === "string" ? row.birth_date : "";
        setBirthDate(isoBirth);
        if (isoBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [y, m, d] = isoBirth.split("-");
          setBirthInput(`${d}/${m}/${y}`);
        }
        const apHydr = hydratePreferredAgeStringsFromProfileRow(row as Record<string, unknown>);
        setObPreferredAgeMinStr(apHydr.minStr);
        setObPreferredAgeMaxStr(apHydr.maxStr);
        setGender(String(row.gender ?? ""));
        setInterestedIn(normalizeInterestedInValues(row.looking_for));
        setIntent(uiIntentFromDbIntent(row.intent));
        {
          const rawHyd = typeof row.city === "string" ? row.city.trim() : "";
          setObLocCity(formatCityDisplay(rawHyd) || rawHyd);
        }
        setObLocLat(typeof row.latitude === "number" ? row.latitude : null);
        setObLocLng(typeof row.longitude === "number" ? row.longitude : null);
        setObLocRadiusKm(
          typeof row.discovery_radius_km === "number" && [10, 25, 50, 100].includes(row.discovery_radius_km)
            ? row.discovery_radius_km
            : 25
        );
        const src = row.location_source;
        setObLocSource(src === "manual" || src === "device" ? src : null);
        const rawTime = String(row.sport_time ?? "");
        setSportTime(rawTime === "Matin" || rawTime === "Soir" ? rawTime : "");
        setSportMotivations(Array.isArray(row.sport_motivation) ? (row.sport_motivation as string[]) : []);
        const cohort = onboardingVariantFromProfile(row.onboarding_variant);
        setOnboardingVariant(cohort);
        const si = typeof row.sport_intensity === "string" ? row.sport_intensity : "";
        setSportIntensity(normalizeIntensityForOnboardingHydrate(si, cohort));
        const pl = row.planning_style;
        setPlanningStyle(
          pl === "spontaneous" || pl === "planned" || pl === "both" ? pl : ""
        );
        setPracticePreferences(Array.isArray(row.practice_preferences) ? (row.practice_preferences as string[]) : []);
        const opennessRaw =
          row.open_to_adapted_activities ??
          (row.pref_open_to_adapted_activity === true
            ? "yes"
            : row.pref_open_to_adapted_activity === false
              ? "no"
              : null);
        setOpenToAdaptedPractice(parseHydratedOpenToAdapted(opennessRaw));
        setSportMatchPreference(parseSportMatchPreference(row.sport_match_preference));
        setAdaptedAmenagements(
          adaptedAmenagementsFromProfile(row.needs_adapted_activities, opennessRaw)
        );
        const sp = row.sport_phrase;
        setSportPhraseOptional(typeof sp === "string" ? sp : "");
        const firstPortraitRef =
          [row.portrait_url, row.main_photo_url, row.avatar_url, row.portrait_path]
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .find(Boolean) ?? "";
        const firstBodyRef =
          [row.fullbody_url, row.activity_photo_path, row.fullbody_path, row.photo2_path]
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .find(Boolean) ?? "";
        const faceRef = normalizeProfilePhotoStoredRef(firstPortraitRef, supabase);
        const activityRef = normalizeProfilePhotoStoredRef(firstBodyRef, supabase);
        setPortraitSavedUrl(faceRef);
        setBodySavedUrl(activityRef);
        void resolveProfilePhotoDisplayUrl(supabase, faceRef).then((url) => {
          if (!cancelled) {
            setPortraitDisplayResolved(url);
            console.log("[profilePhoto] hydrate facePhotoUrl", {
              facePhotoUrl: faceRef || null,
              displayOk: Boolean(url),
            });
          }
        });
        void resolveProfilePhotoDisplayUrl(supabase, activityRef).then((url) => {
          if (!cancelled) {
            setBodyDisplayResolved(url);
            console.log("[profilePhoto] hydrate activityPhotoUrl", {
              activityPhotoUrl: activityRef || null,
              displayOk: Boolean(url),
            });
          }
        });

        // height_cm + has_children: probes séparés (colonnes optionnelles, hors tiers).
        // Si la colonne n’existe pas en BDD, on ignore silencieusement (pas de crash).
        const heightProbe = await supabase
          .from("profiles")
          .select("height_cm")
          .eq("id", userId)
          .maybeSingle();
        if (
          !cancelled &&
          !heightProbe.error &&
          heightProbe.data &&
          typeof heightProbe.data === "object" &&
          "height_cm" in (heightProbe.data as Record<string, unknown>)
        ) {
          const heightRaw = (heightProbe.data as { height_cm?: unknown }).height_cm;
          if (typeof heightRaw === "number" && Number.isFinite(heightRaw) && heightRaw > 0) {
            setHeightCmInput(String(Math.round(heightRaw)));
          }
        }
        const childrenProbe = await supabase
          .from("profiles")
          .select("has_children")
          .eq("id", userId)
          .maybeSingle();
        if (
          !cancelled &&
          !childrenProbe.error &&
          childrenProbe.data &&
          typeof childrenProbe.data === "object" &&
          "has_children" in (childrenProbe.data as Record<string, unknown>)
        ) {
          setHasChildrenChoice(
            hasChildrenFromProfile((childrenProbe.data as { has_children?: unknown }).has_children)
          );
        }

        const { data: ps, error: sportErr } = await supabase
          .from("profile_sports")
          .select("sport_id, level")
          .eq("profile_id", userId);
        if (!cancelled && !sportErr && ps) {
          const rows = ps as { sport_id: string | number; level?: string | null }[];
          setSelectedSportIds(rows.map((x) => x.sport_id));
          const levels: Record<string, string> = {};
          for (const rowSport of rows) {
            const lv = (rowSport.level ?? "").trim();
            if (lv) levels[String(rowSport.sport_id)] = lv;
          }
          setSportLevelsById(levels);
        }
      } finally {
        hydratedDraftRef.current = true;
        if (!cancelled) setHydratingDraft(false);
      }
    }
    void hydrateDraft();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, isProfileComplete, setLanguage]);

  useEffect(() => {
    console.log("[Onboarding] authLoading / user", {
      authLoading,
      userId: user?.id ?? null,
    });
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!isAuthInitialized || authLoading) return;
    if (user?.id) return;
    if (onboardingSubmitInFlightRef.current) return;
    console.log("[Onboarding] redirect to auth (resolved auth, no user)");
    navigate("/auth", { replace: true });
  }, [user?.id, authLoading, isAuthInitialized, navigate]);

  /** Profil déjà complet : purge cache onboarding ; la navigation est synchrone via `<Navigate />` sous le guard de rendu. */
  useLayoutEffect(() => {
    if (!isAuthInitialized || authLoading) return;
    if (isProfileLoading) return;
    if (!user?.id) return;
    if (loading) return;
    if (onboardingSubmitInFlightRef.current) return;
    if (!isProfileComplete) return;
    if (!profile?.id || profile.id !== user.id) return;

    const row = profile as unknown as Record<string, unknown>;
    if (import.meta.env.DEV) {
      console.info("[OnboardingRouteGuard] redirect_decision", {
        auth_user_id: user.id,
        current_route: "/onboarding",
        redirect_reason: "navigate_discover_profile_completed",
        profile_completed: row.profile_completed ?? null,
        onboarding_completed: row.onboarding_completed ?? null,
        onboarding_done: row.onboarding_done ?? null,
      });
    }
    clearOnboardingUiLocalCache();
  }, [
    authLoading,
    isAuthInitialized,
    isProfileComplete,
    isProfileLoading,
    loading,
    profile,
    user?.id,
  ]);

  /** Profils avec `profile_completed` + `onboarding_completed` déjà OK mais `onboarding_done` resté à false — alignement BDD hors flux submit. */
  useEffect(() => {
    if (!user?.id || authLoading || isProfileLoading) return;
    if (!profile?.id || profile.id !== user.id) return;
    const row = profile as Record<string, unknown>;
    if (!isProfileReadyForDiscover(row, Number(row.onboarding_sports_count ?? 0))) return;
    if (row.profile_completed !== true || row.onboarding_completed !== true) return;
    if (row.onboarding_done == true) return;

    let cancelled = false;
    void (async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          onboarding_done: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) {
        console.error("[Onboarding] mount heal onboarding_done Supabase error (exact)", error);
        return;
      }
      if (!cancelled) await refetchProfile();
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isProfileLoading, profile, refetchProfile, user?.id]);

  const quickPickSportsOrdered = useMemo(
    () => orderedQuickPickSports(sportsCatalog),
    [sportsCatalog],
  );

  const searchMatches = useMemo(() => {
    const q = sportSearch.trim();
    if (q.length < 3) return [];
    return sportsCatalog
      .filter((s) => {
        const hay = `${s.name} ${s.category ?? ""}`;
        return sportMatchesFirstThreeLetters(hay, q) && !selectedSportIds.includes(s.id);
      })
      .slice(0, 12);
  }, [sportSearch, sportsCatalog, selectedSportIds]);

  function toggleSportById(sportId: string | number): void {
    const sportKey = String(sportId);
    setSelectedSportIds((prev) => {
      if (prev.some((id) => String(id) === sportKey)) {
        return prev.filter((id) => String(id) !== sportKey);
      }
      if (prev.length >= 3) return prev;
      return [...prev, sportId];
    });
  }

  function addTypedSport(): void {
    const firstMatch = searchMatches[0];
    if (!firstMatch) return;
    toggleSportById(firstMatch.id);
    setSportSearch("");
  }

  const portraitPreviewUrl = useMemo(
    () => (portraitFile ? URL.createObjectURL(portraitFile) : null),
    [portraitFile]
  );
  const bodyPreviewUrl = useMemo(
    () => (bodyFile ? URL.createObjectURL(bodyFile) : null),
    [bodyFile]
  );
  useEffect(() => {
    if (portraitFile || !portraitSavedUrl.trim()) return;
    let cancelled = false;
    void resolveProfilePhotoDisplayUrl(supabase, portraitSavedUrl).then((url) => {
      if (!cancelled && isSafePhotoPreviewSrc(url)) {
        setPortraitDisplayResolved(url);
        console.log("PHOTO_PREVIEW_REMOTE_OK", {
          slot: "face",
          facePhotoUrl: portraitSavedUrl,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [portraitSavedUrl, portraitFile]);

  useEffect(() => {
    if (bodyFile || !bodySavedUrl.trim()) return;
    let cancelled = false;
    void resolveProfilePhotoDisplayUrl(supabase, bodySavedUrl).then((url) => {
      if (!cancelled && isSafePhotoPreviewSrc(url)) {
        setBodyDisplayResolved(url);
        console.log("PHOTO_PREVIEW_REMOTE_OK", {
          slot: "activity",
          activityPhotoUrl: bodySavedUrl,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bodySavedUrl, bodyFile]);

  const portraitDisplayUrl = useMemo(
    () =>
      pickOnboardingPhotoPreviewSrc(
        portraitLocalPreviewUrl,
        portraitPreviewUrl,
        portraitDisplayResolved,
      ),
    [portraitLocalPreviewUrl, portraitPreviewUrl, portraitDisplayResolved],
  );
  const bodyDisplayUrl = useMemo(
    () =>
      pickOnboardingPhotoPreviewSrc(bodyLocalPreviewUrl, bodyPreviewUrl, bodyDisplayResolved),
    [bodyLocalPreviewUrl, bodyPreviewUrl, bodyDisplayResolved],
  );

  useEffect(() => {
    setPortraitPreviewLoadFailed(false);
  }, [portraitDisplayUrl]);

  useEffect(() => {
    setBodyPreviewLoadFailed(false);
  }, [bodyDisplayUrl]);

  useEffect(() => {
    if (portraitDisplayUrl?.startsWith("blob:")) {
      console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "face" });
    }
  }, [portraitDisplayUrl]);

  useEffect(() => {
    if (bodyDisplayUrl?.startsWith("blob:")) {
      console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "activity" });
    }
  }, [bodyDisplayUrl]);

  useEffect(() => {
    console.log("[profilePhoto] preview_state", {
      facePhotoUrl: portraitSavedUrl.trim() || null,
      activityPhotoUrl: bodySavedUrl.trim() || null,
      facePreviewSrc: portraitDisplayUrl ? "set" : "missing",
      activityPreviewSrc: bodyDisplayUrl ? "set" : "missing",
    });
  }, [portraitSavedUrl, bodySavedUrl, portraitDisplayUrl, bodyDisplayUrl]);

  useEffect(() => {
    return () => {
      revokeObjectUrlSafe(portraitPreviewUrl);
      revokeObjectUrlSafe(bodyPreviewUrl);
      revokeObjectUrlSafe(portraitLocalPreviewUrl);
      revokeObjectUrlSafe(bodyLocalPreviewUrl);
    };
  }, [portraitPreviewUrl, bodyPreviewUrl, portraitLocalPreviewUrl, bodyLocalPreviewUrl]);

  /** Après un submit refusé, `handleSubmit` remplit `stepHint` ; purger quand l’utilisateur corrige la dernière étape. */
  useEffect(() => {
    if (step !== TOTAL_STEPS) return;
    setStepHint(null);
  }, [step, confirm18, acceptTerms]);

  /** Doit rester avant tout `return` — sinon hooks en moins si Splash. */
  useEffect(() => {
    setSportLevelsById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of selectedSportIds) {
        const k = String(id);
        if (!next[k]) {
          next[k] = "regular";
          changed = true;
        }
      }
      for (const k of Object.keys(next)) {
        if (!selectedSportIds.some((id) => String(id) === k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedSportIds]);

  useEffect(() => {
    const next = selectedSportIds
      .map((id) => {
        const fromCatalog = sportsCatalog.find((s) => String(s.id) === String(id));
        if (fromCatalog) return fromCatalog;
        return null;
      })
      .filter((s): s is SportOption => Boolean(s));
    setSelectedSports(next);
  }, [selectedSportIds, sportsCatalog]);

  useEffect(() => {
    if (import.meta.env.DEV) console.log("SELECTED_SPORTS", selectedSports.map((s) => s.name));
  }, [selectedSports]);

  const onboardingPortraitSavedOk = portraitSavedUrl.trim() !== "";
  const onboardingBodySavedOk = bodySavedUrl.trim() !== "";
  const onboardingPhotosCanProceed =
    onboardingPortraitSavedOk && onboardingBodySavedOk && photoUploadingKind === null;

  useEffect(() => {
    if (step !== 9 || !onboardingPhotosCanProceed || photoUploadingKind !== null) return;
    setPhotoStepError((prev) => {
      if (!prev) return prev;
      if (prev === t("onboarding_photo_upload_progress")) return prev;
      return null;
    });
  }, [step, onboardingPhotosCanProceed, photoUploadingKind, t]);

  if (authLoading || !isAuthInitialized) {
    return <SplashScreen />;
  }

  if (user?.id && (isProfileLoading || profile == null)) {
    return <SplashScreen />;
  }

  if (
    isAuthInitialized &&
    !authLoading &&
    user?.id &&
    !isProfileLoading &&
    !loading &&
    !onboardingSubmitInFlightRef.current &&
    isProfileComplete &&
    profile?.id === user.id
  ) {
    const row = profile as unknown as Record<string, unknown>;
    console.log("[ONBOARDING_GUARD] decision", {
      profile_completed: row.profile_completed ?? null,
      onboarding_completed: row.onboarding_completed ?? null,
      onboarding_done: row.onboarding_done ?? null,
      is_profile_complete: isProfileComplete,
      target: "/move",
    });
    return <Navigate to="/move" replace />;
  }

  const onboardingPreferredAgeDraftOk = (() => {
    const aminRaw = Number.parseInt(obPreferredAgeMinStr.trim(), 10);
    const amaxRaw = Number.parseInt(obPreferredAgeMaxStr.trim(), 10);
    return (
      Number.isFinite(aminRaw) &&
      Number.isFinite(amaxRaw) &&
      aminRaw >= PROFILE_MIN_VISIBLE_AGE &&
      amaxRaw >= PROFILE_MIN_VISIBLE_AGE &&
      aminRaw <= amaxRaw
    );
  })();

  const locationReady =
    obLocCity.trim().length >= 2 &&
    obLocLat != null &&
    obLocLng != null &&
    [10, 25, 50, 100].includes(obLocRadiusKm);

  const canSubmit =
    firstName.trim() !== "" &&
    birthDate !== "" &&
    isAdultFromBirthIso(birthDate) &&
    onboardingPreferredAgeDraftOk &&
    gender !== "" &&
    interestedIn.length > 0 &&
    intent !== "" &&
    locationReady &&
    selectedSportIds.length >= 1 &&
    selectedSportIds.length <= 3 &&
    selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)])) &&
    openToAdaptedPractice !== "" &&
    (portraitSavedUrl.trim() !== "" || portraitFile != null) &&
    (bodySavedUrl.trim() !== "" || bodyFile != null) &&
    confirm18 &&
    acceptTerms;

  /** Message si le bouton final ne peut pas valider — évite un blocage silencieux (bouton désactivé sans explication). */
  function getCanSubmitBlockReason(): string | null {
    if (firstName.trim() === "") return t("onboarding_err_first_name");
    if (birthDate === "") return t("onboarding_err_birth_incomplete");
    if (!isAdultFromBirthIso(birthDate)) return t("onboarding_err_age");
    if (!onboardingPreferredAgeDraftOk) return t("profile_age_prefs_invalid");
    if (gender === "") return t("onboarding_err_gender");
    if (interestedIn.length === 0) return t("onboarding_err_interested");
    if (intent === "") return t("onboarding_err_intent");
      if (!locationReady) {
      if (obLocCity.trim().length < 2) return t("onboarding_err_city");
      if (![10, 25, 50, 100].includes(obLocRadiusKm)) return t("onboarding_err_radius");
      return t("onboarding_city_pick_list_or_geo");
    }
    if (selectedSportIds.length < 1) return t("onboarding_err_sport_min");
    if (selectedSportIds.length > 3) return t("onboarding_err_sport_max");
    if (!selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)]))) {
      return t("onboarding_err_sport_level");
    }
    if (openToAdaptedPractice === "") {
      return t("onboarding_err_adapted_openness");
    }
    if (portraitSavedUrl.trim() === "" && portraitFile == null) return t("onboarding_err_photos_both");
    if (bodySavedUrl.trim() === "" && bodyFile == null) return t("onboarding_err_photos_both");
    if (!confirm18) return t("onboarding_err_confirm_18");
    if (!acceptTerms) return t("onboarding_err_terms");
    return null;
  }

  const finalStepBlockReason =
    step === TOTAL_STEPS && !canSubmit && !loading ? getCanSubmitBlockReason() : null;

  const onboardingFillSnapshot: OnboardingFillSnapshot = {
    firstName,
    birthDate,
    gender,
    interestedIn,
    intent,
    preferredAgeMinStr: obPreferredAgeMinStr,
    preferredAgeMaxStr: obPreferredAgeMaxStr,
    heightCmInput,
    city: obLocCity,
    lat: obLocLat,
    lng: obLocLng,
    radiusKm: obLocRadiusKm,
    sportIds: selectedSportIds.map((id) => String(id)),
    sportLevelsById,
    portraitSavedUrl,
    bodySavedUrl,
    hasPortraitFile: portraitFile != null,
    hasBodyFile: bodyFile != null,
    confirm18,
    acceptTerms,
    openToAdaptedPractice,
    optionalPhrase: sportPhraseOptional,
  };

  const onboardingProfileFillPct = computeOnboardingProfileFillPercent(onboardingFillSnapshot);

  const canSubmitChecks = buildCanSubmitChecks({
    firstName,
    birthDate,
    onboardingPreferredAgeDraftOk,
    gender,
    interestedInLength: interestedIn.length,
    intent,
    locationReady,
    selectedSportIds: selectedSportIds.map((id) => String(id)),
    sportLevelsById,
    openToAdaptedPractice,
    portraitSavedUrl,
    portraitFile,
    bodySavedUrl,
    bodyFile,
    confirm18,
    acceptTerms,
  });

  function logValidationDiagnostics(
    phase: string,
    opts?: {
      profilePayloadForAudit?: Record<string, unknown>;
      profileSportsRowCount?: number;
      blockReason?: string | null;
      extra?: Record<string, unknown>;
    },
  ): void {
    logOnboardingFinalValidationDiagnostics({
      phase,
      fillSnapshot: onboardingFillSnapshot,
      canSubmitChecks,
      canSubmit,
      profilePayloadForAudit: opts?.profilePayloadForAudit,
      profileSportsRowCount: opts?.profileSportsRowCount,
      blockReason: opts?.blockReason,
      extra: opts?.extra,
    });
  }

  function toggleInterestedInOption(value: InterestedInValue): void {
    setInterestedIn((prev) => {
      if (value === INTERESTED_IN_ALL_VALUE) {
        return prev.includes(INTERESTED_IN_ALL_VALUE) ? [] : [INTERESTED_IN_ALL_VALUE];
      }
      const withoutAll = prev.filter((v) => v !== INTERESTED_IN_ALL_VALUE);
      if (withoutAll.includes(value)) {
        return withoutAll.filter((v) => v !== value);
      }
      return [...withoutAll, value];
    });
  }

  async function persistOnboardingPhotoInProfile(
    userId: string,
    kind: "portrait" | "body",
    publicUrl: string
  ): Promise<Record<string, unknown>> {
    const storedRef = normalizeProfilePhotoStoredRef(publicUrl, supabase).trim();
    if (!storedRef) {
      throw new Error("photo_url_empty");
    }

    console.log("[Onboarding] persistOnboardingPhotoInProfile", {
      userId,
      kind,
      storedRefPrefix: storedRef.slice(0, 96),
    });

    SPLovePhotoLog.urlGenerated({
      source: "Onboarding.persistOnboardingPhotoInProfile",
      userId,
      slot: kind === "portrait" ? "portrait" : "activity",
      storedRef,
      displayUrl: storedRef,
    });

    const payload: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
      ...(kind === "portrait"
        ? {
            portrait_url: storedRef,
            avatar_url: storedRef,
            main_photo_url: storedRef,
          }
        : {
            fullbody_url: storedRef,
          }),
    };

    if (kind === "body") {
      const portraitRef = normalizeProfilePhotoStoredRef(portraitSavedUrl, supabase).trim();
      payload.main_photo_url = portraitRef || storedRef;
    }

    PhotoFlowLog.profilePayloadSent({
      userId,
      source: "Onboarding.persistOnboardingPhotoInProfile",
      portrait_url: typeof payload.portrait_url === "string" ? payload.portrait_url : null,
      fullbody_url: typeof payload.fullbody_url === "string" ? payload.fullbody_url : null,
      main_photo_url: typeof payload.main_photo_url === "string" ? payload.main_photo_url : null,
      avatar_url: typeof payload.avatar_url === "string" ? payload.avatar_url : null,
    });

    const { data: profileUpdateData, error: profileUpdateError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, portrait_url, fullbody_url, main_photo_url")
      .maybeSingle();

    if (profileUpdateError) {
      SPLovePhotoLog.dbSaveError({
        source: "Onboarding.persistOnboardingPhotoInProfile",
        userId,
        slot: kind === "portrait" ? "portrait" : "activity",
        storedRef,
        error: profileUpdateError.message,
      });
      console.error("PHOTO_PROFILE_UPDATE_ERROR", profileUpdateError);
      throw profileUpdateError;
    }
    SPLovePhotoLog.dbSaveSuccess({
      source: "Onboarding.persistOnboardingPhotoInProfile",
      userId,
      slot: kind === "portrait" ? "portrait" : "activity",
      storedRef,
      profileRow: (profileUpdateData ?? payload) as Record<string, unknown>,
    });
    const savedRow = (profileUpdateData ?? payload) as Record<string, unknown>;
    PhotoFlowLog.profileReadback({
      userId,
      source: "Onboarding.persistOnboardingPhotoInProfile",
      portrait_url: typeof savedRow.portrait_url === "string" ? savedRow.portrait_url : null,
      fullbody_url: typeof savedRow.fullbody_url === "string" ? savedRow.fullbody_url : null,
      main_photo_url: typeof savedRow.main_photo_url === "string" ? savedRow.main_photo_url : null,
      avatar_url: typeof savedRow.avatar_url === "string" ? savedRow.avatar_url : null,
    });
    PhotoFlowLog.savedToProfile({
      userId,
      profileId: userId,
      photoField:
        kind === "portrait"
          ? "portrait_url"
          : "fullbody_url",
      storedRef,
      main_photo_url:
        typeof savedRow.main_photo_url === "string" ? savedRow.main_photo_url : null,
      portrait_url:
        typeof savedRow.portrait_url === "string" ? savedRow.portrait_url : null,
    });
    clearProfilePhotoResolutionCache();
    console.log("PHOTO_PROFILE_UPDATE_SUCCESS", profileUpdateData);
    return savedRow;
  }

  async function assignPhotoFile(
    file: File | null | undefined,
    kind: "portrait" | "body"
  ): Promise<void> {
    if (!file) return;
    setStepHint(null);
    setPhotoStepError(null);
    setError(null);
    if (!PHOTO_ACCEPT_MIMES.has(file.type)) {
      setPhotoStepError(t("onboarding_photo_err_format"));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoStepError(t("onboarding_photo_err_too_large"));
      return;
    }
    if (!user?.id) {
      setPhotoStepError(t("photo_error"));
      return;
    }

    PhotoFlowLog.fileSelected({
      userId: user.id,
      slot: kind === "portrait" ? "portrait" : "activity",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    if (kind === "portrait") setPortraitFile(file);
    else setBodyFile(file);

    const localPreviewUrl = URL.createObjectURL(file);
    if (kind === "portrait") {
      setPortraitLocalPreviewUrl((prev) => {
        revokeObjectUrlSafe(prev);
        return localPreviewUrl;
      });
      setPortraitPreviewLoadFailed(false);
      console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "face", phase: "selected" });
    } else {
      setBodyLocalPreviewUrl((prev) => {
        revokeObjectUrlSafe(prev);
        return localPreviewUrl;
      });
      setBodyPreviewLoadFailed(false);
      console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "activity", phase: "selected" });
    }
    setPhotoUploadingKind(kind);

    try {
      const slot = kind === "portrait" ? "portrait" : "activity";
      const uploaded = await uploadProfilePhoto(supabase, user.id, file, slot);
      const savedRow = await persistOnboardingPhotoInProfile(user.id, kind, uploaded.storedRef);
      if (savedRow) {
        commitProfileRow(
          mergeProfileScreenRowPreservingPhotos(
            (profile ?? { id: user.id }) as Record<string, unknown>,
            savedRow,
          ),
        );
      }
      if (kind === "portrait") {
        setPortraitSavedUrl(uploaded.storedRef);
        if (isSafePhotoPreviewSrc(uploaded.displayUrl)) {
          setPortraitDisplayResolved(uploaded.displayUrl);
          console.log("PHOTO_PREVIEW_REMOTE_OK", {
            slot: "face",
            facePhotoUrl: uploaded.publicUrl,
            phase: "upload",
          });
        }
        setPortraitFile(null);
        console.log("[profilePhoto] facePhotoUrl", {
          facePhotoUrl: uploaded.publicUrl,
          displayUrl: uploaded.displayUrl.slice(0, 80),
        });
      } else {
        setBodySavedUrl(uploaded.storedRef);
        if (isSafePhotoPreviewSrc(uploaded.displayUrl)) {
          setBodyDisplayResolved(uploaded.displayUrl);
          console.log("PHOTO_PREVIEW_REMOTE_OK", {
            slot: "activity",
            activityPhotoUrl: uploaded.publicUrl,
            phase: "upload",
          });
        }
        setBodyFile(null);
        console.log("[profilePhoto] activityPhotoUrl", {
          activityPhotoUrl: uploaded.publicUrl,
          displayUrl: uploaded.displayUrl.slice(0, 80),
        });
      }
      await saveOnboardingDraft(step);
    } catch (uploadErr) {
      const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      PhotoFlowLog.uploadResult({
        userId: user.id,
        slot: kind === "portrait" ? "portrait" : "activity",
        ok: false,
        error: errMsg,
      });
      console.error("[profilePhoto] upload_error", {
        kind,
        error: errMsg,
      });
      logDetailedError("onboarding immediate photo upload", uploadErr, { kind });
      setPhotoStepError(t("photo_error"));
    } finally {
      setPhotoUploadingKind(null);
    }
  }

  async function resolveSelectedSportIdsForPersistence(): Promise<(string | number)[]> {
    const catalogById = new Map(sportsCatalog.map((s) => [String(s.id), s.id]));
    const out: (string | number)[] = [];
    for (const rawId of selectedSportIds) {
      const id = catalogById.get(String(rawId));
      if (id == null) continue;
      if (!out.some((x) => String(x) === String(id))) out.push(id);
    }
    return out;
  }

  function handleBirthInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = birthDigitsFromRaw(e.target.value);
    setBirthInput(formatBirthDisplay(digits));
    setBirthDate(tryParseBirthIso(digits) ?? "");
  }

  function validateStep(current: number, locOverride?: { lat: number; lng: number } | null): boolean {
    setStepHint(null);
    if (current === 1) {
      if (!firstName.trim()) {
        setStepHint(t("onboarding_err_first_name"));
        return false;
      }
      if (!birthDate) {
        const d = birthDigitsFromRaw(birthInput);
        setStepHint(
          d.length === 8
            ? t("onboarding_err_birth_invalid")
            : t("onboarding_err_birth_incomplete")
        );
        return false;
      }
      if (!isAdultFromBirthIso(birthDate)) {
        setStepHint(t("onboarding_err_age"));
        return false;
      }
      return true;
    }
    if (current === 2) {
      if (!gender) {
        setStepHint(t("onboarding_err_gender"));
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (interestedIn.length === 0) {
        setStepHint(t("onboarding_err_interested"));
        return false;
      }
      return true;
    }
    if (current === 4) {
      const cityOk = obLocCity.trim().length >= 2;
      const latV = locOverride?.lat ?? obLocLat;
      const lngV = locOverride?.lng ?? obLocLng;
      const coordsOk =
        latV != null &&
        lngV != null &&
        typeof latV === "number" &&
        typeof lngV === "number" &&
        Number.isFinite(latV) &&
        Number.isFinite(lngV);
      if (!cityOk) {
        setStepHint(t("onboarding_err_city"));
        return false;
      }
      if (!coordsOk) {
        setStepHint(t("onboarding_city_pick_list_or_geo"));
        return false;
      }
      if (![10, 25, 50, 100].includes(obLocRadiusKm)) {
        setStepHint(t("onboarding_err_radius"));
        return false;
      }
      return true;
    }
    if (current === 5) {
      if (selectedSportIds.length < 1) {
        setStepHint(t("onboarding_err_sport_min_short"));
        return false;
      }
      if (selectedSportIds.length > 3) {
        setStepHint(t("onboarding_err_sport_max"));
        return false;
      }
      if (!selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)]))) {
        setStepHint(t("onboarding_err_sport_reselect"));
        return false;
      }
      return true;
    }
    if (current === 6) {
      return true;
    }
    if (current === 7) {
      if (!intent) {
        setStepHint(t("onboarding_err_intent"));
        return false;
      }
      return true;
    }
    if (current === 8) {
      if (!openToAdaptedPractice) {
        setStepHint(t("onboarding_err_adapted_openness"));
        return false;
      }
      return true;
    }
    if (current === 9) {
      if (photoUploadingKind !== null) {
        setPhotoStepError(t("onboarding_photo_upload_progress"));
        return false;
      }
      const photoCount = countOnboardingPhotoSlots(
        portraitSavedUrl,
        portraitFile,
        bodySavedUrl,
        bodyFile,
      );
      if (photoCount === 0) {
        setPhotoStepError(t("onboarding_photo_err_none"));
        return false;
      }
      if (photoCount === 1) {
        setPhotoStepError(t("onboarding_photo_err_one_missing"));
        return false;
      }
      setPhotoStepError(null);
      return true;
    }
    if (current === 10) {
      const phrase = sportPhraseOptional.trim();
      if (phrase && antiExitValidator(phrase, "onboarding").isBlocked) {
        setStepHint(t("safety_content_refusal"));
        return false;
      }
      return true;
    }
    if (current === 11) {
      if (!confirm18) {
        setStepHint(t("onboarding_err_confirm_18"));
        return false;
      }
      if (!acceptTerms) {
        setStepHint(t("onboarding_err_terms"));
        return false;
      }
      return true;
    }
    return true;
  }

  async function goNext() {
    if (photoStepDraftSaving) return;
    if (authLoading || !user?.id) {
      console.warn("[Onboarding] next step blocked", {
        reason: authLoading ? "authLoading" : "no user",
      });
      return;
    }
    if (step === 1) {
      if (step1SubStep === 0) {
        setStepHint(null);
        if (!firstName.trim()) {
          setStepHint(t("onboarding_err_first_name"));
          return;
        }
        setStep1SubStep(1);
        await saveOnboardingDraft(1);
        return;
      }
      if (step1SubStep === 1) {
        setStepHint(null);
        if (!birthDate) {
          const d = birthDigitsFromRaw(birthInput);
          setStepHint(
            d.length === 8 ? t("onboarding_err_birth_invalid") : t("onboarding_err_birth_incomplete")
          );
          return;
        }
        if (!isAdultFromBirthIso(birthDate)) {
          setStepHint(t("onboarding_err_age"));
          return;
        }
        setStep1SubStep(2);
        await saveOnboardingDraft(1);
        return;
      }
      if (step1SubStep === 2) {
        setStepHint(null);
        const aminRaw = Number.parseInt(obPreferredAgeMinStr.trim(), 10);
        const amaxRaw = Number.parseInt(obPreferredAgeMaxStr.trim(), 10);
        if (
          !Number.isFinite(aminRaw) ||
          !Number.isFinite(amaxRaw) ||
          aminRaw < PROFILE_MIN_VISIBLE_AGE ||
          amaxRaw < PROFILE_MIN_VISIBLE_AGE ||
          aminRaw > amaxRaw
        ) {
          setStepHint(t("profile_age_prefs_invalid"));
          return;
        }
        setStep1SubStep(3);
        await saveOnboardingDraft(1);
        return;
      }
      if (step1SubStep === 3) {
        setStep1SubStep(4);
        await saveOnboardingDraft(1);
        return;
      }
    }
    if (step === 4) {
      const cityTrim = obLocCity.trim();
      if (cityTrim.length < 2) {
        setStepHint(t("onboarding_err_city"));
        return;
      }
      if (![10, 25, 50, 100].includes(obLocRadiusKm)) {
        setStepHint(t("onboarding_err_radius"));
        return;
      }
      if (obLocLat == null || obLocLng == null) {
        setStepHint(t("onboarding_city_pick_list_or_geo"));
        return;
      }
    }
    if (!validateStep(step, undefined)) return;
    if (step === 9 && photoUploadingKind !== null) {
      setPhotoStepError(t("onboarding_photo_upload_progress"));
      return;
    }
    if (step === 4 && obLocSource === null && obLocCity.trim().length >= 2) {
      setObLocSource("manual");
    }
    setError(null);
    setOptionalProfileWarning(null);
    if (step !== 9) setPhotoStepError(null);
    setModerationSuccessNote(null);
    const stepBeforeSave = step;
    if (stepBeforeSave === 9) setPhotoStepDraftSaving(true);
    try {
      await saveOnboardingDraft(stepBeforeSave);
      if (stepBeforeSave === 1) setStep1SubStep(0);
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    } finally {
      if (stepBeforeSave === 9) setPhotoStepDraftSaving(false);
    }
  }

  async function handleObUseDeviceLocation() {
    setStepHint(null);
    setObLocGeoLoading(true);
    try {
      const c = await getCurrentPositionCoords();
      if (!c) {
        setStepHint(t("onboarding_err_geo_unavailable"));
        return;
      }
      const city = await reverseGeocodeCity(c.lat, c.lng);
      setObLocLat(c.lat);
      setObLocLng(c.lng);
      setObLocSource("device");
      if (city) {
        const nice = formatCityDisplay(city) || city.trim();
        setObLocCity(nice);
      } else if (!obLocCity.trim()) {
        setObLocCity(t("onboarding_zone_fallback"));
      }
    } finally {
      setObLocGeoLoading(false);
    }
  }

  function goBack() {
    setStepHint(null);
    setPhotoStepError(null);
    setPhotoStepDraftSaving(false);
    setModerationSuccessNote(null);
    if (step === 1 && step1SubStep > 0) {
      setStep1SubStep((s) => s - 1);
      return;
    }
    if (step === 2) {
      setStep(1);
      setStep1SubStep(4);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || onboardingSubmitInFlightRef.current) {
      return;
    }
    if (authLoading) {
      console.warn("[Onboarding] final submit blocked: authLoading");
      return;
    }

    let onboardingResolvedUserId: string | undefined;

    onboardingSubmitInFlightRef.current = true;
    try {
    const stillAuthenticated = await syncAuthSession();
    console.log("[Onboarding] syncAuthSession", stillAuthenticated);
    
    const {
      data: { user: freshUser },
      error: getUserError,
    } = await supabase.auth.getUser();
    
    console.log("[Onboarding] getUser", { freshUser, getUserError });
    
    onboardingResolvedUserId = (freshUser ?? user)?.id;

    if (getUserError || !onboardingResolvedUserId) {
      onboardingSubmitInFlightRef.current = false;
      console.warn("[Onboarding] final submit: no authenticated user after refresh", getUserError);
      alert(t("onboarding_err_session"));
      navigate("/auth", { replace: true });
      return;
    }
    console.log("[Onboarding] final submit start");
    logValidationDiagnostics("submit_start");
    if (!canSubmit) {
      onboardingSubmitInFlightRef.current = false;
      const hint = getCanSubmitBlockReason() ?? t("onboarding_err_submit_incomplete");
      setStepHint(hint);
      logValidationDiagnostics("blocked_canSubmit", { blockReason: hint });
      return;
    }
    for (let s = 1; s <= TOTAL_STEPS; s++) {
      if (!validateStep(s)) {
        onboardingSubmitInFlightRef.current = false;
        logValidationDiagnostics("blocked_validateStep", {
          blockReason: `Étape ${s} invalide (voir stepHint à l’écran)`,
          extra: { step: s },
        });
        setStep(s);
        if (s === 1) setStep1SubStep(0);
        return;
      }
    }
    if ((portraitSavedUrl.trim() === "" && !portraitFile) || (bodySavedUrl.trim() === "" && !bodyFile)) {
      onboardingSubmitInFlightRef.current = false;
      const submitPhotoCount = countOnboardingPhotoSlots(
        portraitSavedUrl,
        portraitFile,
        bodySavedUrl,
        bodyFile,
      );
      setPhotoStepError(
        submitPhotoCount === 0
          ? t("onboarding_photo_err_none")
          : t("onboarding_photo_err_one_missing"),
      );
      setStep(9);
      return;
    }
    } catch (bootstrapErr) {
      onboardingSubmitInFlightRef.current = false;
      logDetailedError("handleSubmit bootstrap", bootstrapErr);
      console.error("[Onboarding submit] bootstrap error", bootstrapErr);
      setError(t("onboarding_error_profile_gate"));
      return;
    }

    setError(null);
    setStepHint(null);
    setPhotoStepError(null);

    if (!isAdultFromBirthIso(birthDate)) {
      onboardingSubmitInFlightRef.current = false;
      setError(t("onboarding_error_age_gate"));
      console.error("[Onboarding submit] blocked: under minimum age");
      return;
    }

    setLoading(true);

    const authUserId = onboardingResolvedUserId;

    try {
      console.log("[Onboarding submit] start", {
        userId: authUserId,
        selectedSportsCount: selectedSportIds.length,
      });

      let portraitUrl: string = normalizeProfilePhotoStoredRef(portraitSavedUrl, supabase);
      let fullbodyUrl: string = normalizeProfilePhotoStoredRef(bodySavedUrl, supabase);
      try {
        if (portraitFile) {
          console.log("[Onboarding submit] start: upload photo portrait");
          const uploadedPortrait = await uploadProfilePhoto(
            supabase,
            authUserId,
            portraitFile,
            "portrait",
          );
          portraitUrl = uploadedPortrait.storedRef;
          setPortraitSavedUrl(portraitUrl);
          setPortraitDisplayResolved(uploadedPortrait.displayUrl);
          console.log("[profilePhoto] facePhotoUrl", { facePhotoUrl: portraitUrl });
        }
        if (bodyFile) {
          console.log("[Onboarding submit] start: upload photo fullbody");
          const uploadedBody = await uploadProfilePhoto(supabase, authUserId, bodyFile, "activity");
          fullbodyUrl = uploadedBody.storedRef;
          setBodySavedUrl(fullbodyUrl);
          setBodyDisplayResolved(uploadedBody.displayUrl);
          console.log("[profilePhoto] activityPhotoUrl", { activityPhotoUrl: fullbodyUrl });
        }
        if (!portraitUrl.trim() || !fullbodyUrl.trim()) {
          console.error("[profilePhoto] submit_missing_urls", {
            facePhotoUrl: portraitUrl || null,
            activityPhotoUrl: fullbodyUrl || null,
          });
          throw new Error("photos_not_saved");
        }

        await ensureOnboardingPhotosInProfile(
          authUserId,
          portraitUrl,
          fullbodyUrl,
          "Onboarding.submit.afterUpload",
        );
      } catch (uploadErr) {
        console.error("[profilePhoto] upload_error", {
          error: uploadErr instanceof Error ? uploadErr.message : uploadErr,
        });
        logDetailedError("upload photos", uploadErr);
        setError(t("photo_error"));
        return;
      }

      let slot1Status: PhotoModerationStatus = "approved";
      let slot2Status: PhotoModerationStatus = "approved";
      let moderationRejected = false;
      let moderationUiReason: string | null = null;

      if (!PHOTO_VERIFICATION_PLACEHOLDER) {
        const path1 = profilePhotoStoragePathFromPublicUrl(portraitUrl);
        const path2 = profilePhotoStoragePathFromPublicUrl(fullbodyUrl);
        if (!path1 || !path2) {
          setLoading(false);
          setError(t("onboarding_error_photo_moderation_prep"));
          return;
        }
        const m1 = await invokeModeratePhoto({
          userId: authUserId,
          photoSlot: 1,
          storagePath: path1,
        });
        if (m1.error || !m1.data?.status) {
          setLoading(false);
          logDetailedError("photo moderation slot 1", m1.error ?? new Error("status missing"), {
            response: m1,
          });
          setError(t("onboarding_error_photo_moderation_unavailable"));
          return;
        }
        slot1Status = m1.data.status;
        const m2 = await invokeModeratePhoto({
          userId: authUserId,
          photoSlot: 2,
          storagePath: path2,
        });
        if (m2.error || !m2.data?.status) {
          setLoading(false);
          logDetailedError("photo moderation slot 2", m2.error ?? new Error("status missing"), {
            response: m2,
          });
          setError(t("onboarding_error_photo_moderation_unavailable"));
          return;
        }
        slot2Status = m2.data.status;
        moderationRejected = slot1Status === "rejected" || slot2Status === "rejected";
        if (moderationRejected) {
          moderationUiReason =
            slot1Status === "rejected"
              ? (m1.data.ui_reason_code ?? null)
              : (m2.data.ui_reason_code ?? null);
        }
      }

      const locSourceResolved: "manual" | "device" = obLocSource ?? "manual";

      const submitCityFinal = normalizeProfileCityForStorage(obLocCity);
      const pairOk =
        typeof obLocLat === "number" &&
        typeof obLocLng === "number" &&
        Number.isFinite(obLocLat) &&
        Number.isFinite(obLocLng);
      let submitLatFinal = pairOk ? obLocLat : null;
      let submitLngFinal = pairOk ? obLocLng : null;
      const submitCoordsOk =
        typeof submitLatFinal === "number" &&
        typeof submitLngFinal === "number" &&
        Number.isFinite(submitLatFinal) &&
        Number.isFinite(submitLngFinal);
      if (submitCityFinal != null && submitCityFinal.length >= 2 && !submitCoordsOk) {
        setLoading(false);
        setError(null);
        setStepHint(t("onboarding_city_pick_list_or_geo"));
        setStep(4);
        onboardingSubmitInFlightRef.current = false;
        return;
      }

      const moderationAllowsComplete = PHOTO_VERIFICATION_PLACEHOLDER || !moderationRejected;

      let moderationBanner: string | null = null;
      if (!PHOTO_VERIFICATION_PLACEHOLDER && moderationAllowsComplete) {
        moderationBanner =
          slot1Status === "pending_review" || slot2Status === "pending_review"
            ? t("onboarding_moderation_pending_banner")
            : t("onboarding_moderation_approved_banner");
      }
      setModerationSuccessNote(moderationBanner);

      /** `canSubmit` + étapes locales ont déjà validé le formulaire ; on aligne toujours les trois flags métier finaux. */
      const nowIso = new Date().toISOString();
      const intentDbValue = dbIntentFromUiIntent(intent);

      const onboardingPreferredAge = preferredAgeFromDraftInputs(
        obPreferredAgeMinStr,
        obPreferredAgeMaxStr,
      );
      const profilePayloadBase: Record<string, unknown> = {
        id: authUserId,
        first_name: firstName.trim(),
        birth_date: birthDate,
        gender,
        height_cm: parseHeightCmOptionalInput(heightCmInput),
        has_children: hasChildrenForDb(hasChildrenChoice),
        preferred_age_min: onboardingPreferredAge.min,
        preferred_age_max: onboardingPreferredAge.max,
        looking_for: serializeInterestedInValues(interestedIn),
        intent: intentDbValue,
        meet_pref: intentDbValue,
        city: submitCityFinal,
        latitude: submitLatFinal,
        longitude: submitLngFinal,
        discovery_radius_km: obLocRadiusKm,
        location_source: locSourceResolved,
        location_updated_at: nowIso,
        sport_time: sportTime || null,
        sport_intensity: sportIntensity || null,
        meet_vibe: null,
        planning_style: planningStyle || null,
        sport_motivation: sportMotivations.length > 0 ? sportMotivations : null,
        sport_phrase: sportPhraseOptional.trim() ? sportPhraseOptional.trim().slice(0, 500) : null,
        practice_preferences: practicePreferences,
        onboarding_sports_count: selectedSportIds.length,
        onboarding_sports_with_level_count: selectedSportIds.filter((id) => Boolean(sportLevelsById[String(id)])).length,
        sport_match_preference: sportMatchPreference,
        needs_adapted_activities: needsAdaptedActivitiesForDb(adaptedAmenagements),
        open_to_adapted_activities: openToAdaptedPractice || null,
        portrait_url: portraitUrl,
        fullbody_url: fullbodyUrl,
        main_photo_url: portraitUrl || fullbodyUrl,
        profile_completed: false,
        onboarding_completed: false,
        onboarding_done: false,
        accepted_terms_at: acceptTerms ? nowIso : null,
        accepted_privacy_at: acceptTerms ? nowIso : null,
        updated_at: nowIso,
        language,
      };

      logValidationDiagnostics("before_preSubmit_audit", {
        profilePayloadForAudit: profilePayloadBase,
        profileSportsRowCount: selectedSportIds.length,
      });

      const preSubmitAudit = auditProfileCriticalDataForDiscover(
        profilePayloadBase,
        selectedSportIds.length,
      );
      if (!preSubmitAudit.ok) {
        const auditMsg = messageForDiscoverReadinessGap(preSubmitAudit.missingFields, t);
        logValidationDiagnostics("blocked_preSubmit_audit", {
          profilePayloadForAudit: profilePayloadBase,
          profileSportsRowCount: selectedSportIds.length,
          blockReason: auditMsg,
          extra: {
            missingFields: preSubmitAudit.missingFields,
            suggestedStep: preSubmitAudit.suggestedStep,
          },
        });
        setLoading(false);
        onboardingSubmitInFlightRef.current = false;
        setStep(preSubmitAudit.suggestedStep);
        setStepHint(null);
        setError(auditMsg);
        return;
      }

      const completionFlags = computeStrictCompletionFlags(
        profilePayloadBase,
        selectedSportIds.length,
      );
      const profilePayload: Record<string, unknown> = {
        ...profilePayloadBase,
        ...completionFlags,
      };

      OnboardingFlowLog.finalSubmitPayload({
        id: authUserId,
        ...profilePayload,
        onboarding_step: "completed",
      });

      if (PHOTO_VERIFICATION_PLACEHOLDER) {
        profilePayload.photo1_status = "approved";
        profilePayload.photo2_status = "approved";
      }

      if (!PHOTO_VERIFICATION_PLACEHOLDER && moderationRejected) {
        const detail = photoModerationRejectedDetail(moderationUiReason);
        setPhotoStepError(
          detail
            ? `${photoModerationHeadline("rejected")} — ${detail}.`
            : photoModerationHeadline("rejected"),
        );
        setStep(9);
        const failPayload: Record<string, unknown> = {
          ...profilePayload,
          profile_completed: false,
          onboarding_completed: false,
          onboarding_done: false,
        };
        let { error: bailErr } = await supabase
          .from("profiles")
          .upsert({ ...failPayload, id: authUserId }, { onConflict: "id" });
        if (bailErr) {
          const missingColumns = getMissingOptionalProfileColumns(bailErr);
          if (missingColumns.length > 0) {
            console.warn("[Onboarding submit] rejection upsert optional columns missing, retrying", {
              missingColumns,
              code: bailErr.code,
              message: bailErr.message,
            });
            const failPayloadFallback = stripOptionalProfileColumnsFromPayload(failPayload, missingColumns);
            ({ error: bailErr } = await supabase
              .from("profiles")
              .upsert({ ...failPayloadFallback, id: authUserId }, { onConflict: "id" }));
          }
        }
        if (bailErr) {
          logDetailedError("profiles upsert after photo rejection", bailErr, {
            payload: failPayload,
          });
          setError(t("onboarding_error_profile_save"));
        }
        setLoading(false);
        return;
      }

      const prodSanitizeCtx: ProdPayloadSanitizeContext = {
        interestedIn: serializeInterestedInValues(interestedIn) ?? "",
        sportTime,
        practicePreferences,
        portraitUrl: portraitUrl,
        fullbodyUrl: fullbodyUrl,
      };

      /** Payload prod : même base que le métier ; retries retirent colonnes / mappent legacy. */
      let payloadForUpsert: Record<string, unknown> = reinjectOnboardingPhotoUrlsInPayload(
        { ...profilePayload },
        prodSanitizeCtx,
      );
      let profileUpsertSelect = PROFILE_UPSERT_ONBOARDING_SELECT;
      let profileError: { message?: string; code?: string | number } | null = null;
      let upsertRow: unknown = null;
      let aggressivePhase = 0;
      if (import.meta.env.DEV) {
        console.log("PROFILE_UPDATE_PAYLOAD", payloadForUpsert);
      }

      for (let attempt = 0; attempt < 24; attempt++) {
        console.log("[Onboarding submit] sending data:", {
          table: "profiles",
          operation: attempt === 0 ? "upsert" : "upsert retry",
          attempt: attempt + 1,
          payload: payloadForUpsert,
        });

        console.log("[Onboarding submit] start: upsert profiles", {
          select: profileUpsertSelect,
          payload: payloadForUpsert,
        });

        const profilesRequest = await supabase
          .from("profiles")
          .upsert(
            {
              ...payloadForUpsert,
              id: authUserId,
            },
            { onConflict: "id" }
          )
          .select(profileUpsertSelect)
          .maybeSingle();

        profileError = profilesRequest.error;
        upsertRow = profilesRequest.data;

        console.log("[Onboarding submit] result: upsert profiles raw", {
          error: profileError ?? null,
          hasData: Boolean(upsertRow),
        });

        if (!profileError) {
          SPLovePhotoLog.dbSaveSuccess({
            source: "Onboarding.submit.upsert",
            userId: authUserId,
            profileRow: (upsertRow ?? payloadForUpsert) as Record<string, unknown>,
            extra: { attempt: attempt + 1 },
          });
          break;
        }

        if (attempt === 0) {
          const faultyColumn = extractFaultyColumnNameFromPostgrestMessage(profileError.message);
          console.error("[Onboarding submit] upsert/select failure details", {
            operation: "profiles upsert(...).select(...).maybeSingle()",
            select: profileUpsertSelect,
            faultyColumn,
            message: profileError.message,
            code: profileError.code,
            details: (profileError as { details?: string }).details,
            hint: (profileError as { hint?: string }).hint,
          });
          const upsertOnlyCheck = await supabase.from("profiles").upsert(
            {
              ...payloadForUpsert,
              id: authUserId,
            },
            { onConflict: "id" }
          );
          const upsertOnlyError = upsertOnlyCheck.error;
          console.log("[Onboarding submit] diagnostic: profiles upsert-only check", {
            upsertOnlyOk: !upsertOnlyError,
            upsertOnlyError: upsertOnlyError ?? null,
          });
          if (!upsertOnlyError) {
            console.error("[Onboarding submit] diagnostic verdict: upsert OK but select KO");
          } else {
            console.error("[Onboarding submit] diagnostic verdict: upsert KO");
          }
        }

        const missingOptional = getMissingOptionalProfileColumns(profileError);
        if (missingOptional.length > 0) {
          console.warn("[Onboarding submit] profiles upsert optional columns missing, retrying", {
            missingOptional,
            code: profileError.code,
            message: profileError.message,
          });
          const payloadStripped = stripOptionalProfileColumnsFromPayload(payloadForUpsert, missingOptional);
          const hasLocationSource = !missingOptional.includes("location_source");
          profileUpsertSelect = hasLocationSource
            ? stripOptionalColumnsFromSelect(PROFILE_UPSERT_ONBOARDING_SELECT)
            : stripOptionalColumnsFromSelect(PROFILE_UPSERT_ONBOARDING_SELECT_CORE);
          const prevSerialized = JSON.stringify(payloadForUpsert);
          payloadForUpsert = payloadStripped;
          if (JSON.stringify(payloadForUpsert) !== prevSerialized) {
            setOptionalProfileWarning(t("onboarding_optional_fields_warning"));
          }
          continue;
        }

        const faulty = extractFaultyColumnNameFromPostgrestMessage(profileError.message);
        const prevSerialized = JSON.stringify(payloadForUpsert);
        if (faulty) {
          payloadForUpsert = sanitizeProfilesPayloadForProd(
            payloadForUpsert,
            profileError.message,
            prodSanitizeCtx,
            -1
          );
        } else if (aggressivePhase < PROD_SANITIZE_AGGRESSIVE_STRIP_ORDER.length) {
          payloadForUpsert = sanitizeProfilesPayloadForProd(
            payloadForUpsert,
            undefined,
            prodSanitizeCtx,
            aggressivePhase
          );
          aggressivePhase += 1;
        } else {
          break;
        }

        if (JSON.stringify(payloadForUpsert) === prevSerialized) {
          console.warn("[Onboarding submit] profiles upsert: no payload change after sanitize, stopping retries");
          break;
        }
      }

      console.log("[Onboarding submit] result:", {
        step: "upsert profiles",
        profileUpsert: { error: profileError?.message ?? null, data: upsertRow ?? null },
        select: profileUpsertSelect,
        payloadFinal: payloadForUpsert,
      });

      if (profileError || !upsertRow) {
        if (profileError) {
          logDetailedError("profiles upsert", profileError, {
            select: profileUpsertSelect,
            payloadInitial: profilePayload,
            payloadFinal: payloadForUpsert,
            fallbackTriggered: profileUpsertSelect !== PROFILE_UPSERT_ONBOARDING_SELECT,
          });
          console.error("[Onboarding submit] Supabase profiles upsert error (exact)", profileError);
          console.error("[Onboarding submit] verdict: upsert/select KO", {
            outcome: "upsert KO OR select KO",
            select: profileUpsertSelect,
            faultyColumn: extractFaultyColumnNameFromPostgrestMessage(profileError.message),
          });
          setError(
            /18 ans|réservé aux personnes|18 years|age/i.test(profileError.message || "")
              ? t("onboarding_error_age_gate")
              : t("onboarding_error_profile_gate")
          );
        } else {
          setError(t("onboarding_error_profile_gate"));
        }
        return;
      }

      if (!isProfileRecord(upsertRow)) {
        console.error("[Onboarding submit] upsert: réponse inattendue (pas un objet profil)", upsertRow);
        setError(t("onboarding_error_profile_incomplete"));
        return;
      }

      await ensureOnboardingPhotosInProfile(
        authUserId,
        portraitUrl,
        fullbodyUrl,
        "Onboarding.submit.postUpsert",
      );

      const completionWrite = await ensureOnboardingCompletionInProfile(
        supabase,
        authUserId,
        acceptTerms ? nowIso : new Date().toISOString(),
        "Onboarding.submit.postUpsert",
      );
      if (completionWrite.error) {
        console.error("[Onboarding submit] ensureOnboardingCompletionInProfile failed", completionWrite.error);
      }

      const validSportIds = Array.from(new Set(await resolveSelectedSportIdsForPersistence()));
      console.log("SPORTS_PERSIST_START", selectedSports.map((s) => s.name));

      if (validSportIds.length > 0) {
        console.log("[Onboarding submit] sending data:", {
          table: "profile_sports",
          operation: "delete then insert",
          profile_id: authUserId,
          sport_ids: validSportIds,
        });

        const { error: deleteSportsErr } = await supabase
          .from("profile_sports")
          .delete()
          .eq("profile_id", authUserId);
        if (deleteSportsErr) {
          console.error("[Onboarding submit] Supabase profile_sports delete error (exact)", deleteSportsErr);
          logDetailedError("profile_sports delete", deleteSportsErr, { profile_id: authUserId });
          setError(t("onboarding_error_profile_gate"));
          return;
        }
        console.log("[Onboarding submit] result:", { step: "delete profile_sports", ok: true });

        const rows = validSportIds.map((sportId) => ({
          profile_id: authUserId,
          sport_id: sportId,
          level: sportLevelsById[String(sportId)] ?? null,
        }));
        console.log("[Onboarding submit] sending data:", {
          table: "profile_sports",
          operation: "insert",
          rows,
        });

        const { error: sportsError, data: sportsData } = await supabase
          .from("profile_sports")
          .insert(rows)
          .select("sport_id");

        console.log("[Onboarding submit] result:", {
          profileSportsInsert: { error: sportsError?.message ?? null, rows: sportsData?.length ?? 0 },
        });

        if (sportsError) {
          console.error("[Onboarding submit] Supabase profile_sports insert error (exact)", sportsError);
          logDetailedError("profile_sports insert", sportsError, { rows });
          setError(t("onboarding_error_profile_gate"));
          return;
        }
        console.log("SPORTS_PERSIST_RESULT", {
          inserted: sportsData?.length ?? 0,
          ids: validSportIds,
          error: null,
        });
      } else {
        console.log("SPORTS_PERSIST_RESULT", { inserted: 0, ids: [], error: null });
      }

      let profileReloadRow: Record<string, unknown> | null = null;

      async function reloadOnboardingProfileRow(): Promise<{
        row: Record<string, unknown> | null;
        error: { message?: string } | null;
      }> {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUserId)
          .single();
        profileReloadRow = (data as Record<string, unknown> | null) ?? null;
        return { row: profileReloadRow, error };
      }

      const firstReload = await reloadOnboardingProfileRow();
      if (firstReload.error) {
        logDetailedError("profiles reload after submit", firstReload.error, { userId: authUserId });
        SPLovePhotoLog.profileLoadEmpty({
          source: "Onboarding.submit.profileReload",
          userId: authUserId,
          error: firstReload.error.message ?? "unknown",
        });
      } else if (firstReload.row && !profileRowHasCanonicalPhotos(firstReload.row)) {
        console.warn("[Onboarding submit] profile reload sans URLs photo — nouvelle écriture dédiée");
        await ensureOnboardingPhotosInProfile(
          authUserId,
          portraitUrl,
          fullbodyUrl,
          "Onboarding.submit.profileReloadHeal",
        );
        await reloadOnboardingProfileRow();
      }

      if (profileReloadRow) {
        SPLovePhotoLog.profileLoadSuccess({
          source: "Onboarding.submit.profileReload.select_star",
          userId: authUserId,
          profileRow: profileReloadRow,
        });
      }

      let effectiveProfileReloadRow = profileReloadRow
        ? mergeOnboardingPhotosIntoProfileRow(profileReloadRow, portraitUrl, fullbodyUrl)
        : null;
      if (effectiveProfileReloadRow && profileRowNeedsOnboardingDoneBackfill(effectiveProfileReloadRow)) {
        const { data: patchedRow, error: odHealErr } = await supabase
          .from("profiles")
          .update({
            profile_completed: true,
            onboarding_completed: true,
            onboarding_done: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", authUserId)
          .select("*")
          .maybeSingle();
        if (odHealErr) {
          console.error("[Onboarding submit] onboarding_done heal after reload Supabase error (exact)", odHealErr);
        } else if (patchedRow) {
          effectiveProfileReloadRow = patchedRow;
        }
      }

      console.log("[Onboarding submit] start: refetchProfile");
      const refreshedProfile = await refetchProfile();
      console.log("[Onboarding submit] result: refetchProfile done", {
        hasProfile: Boolean(refreshedProfile),
        profile_completed: refreshedProfile?.profile_completed ?? null,
        onboarding_completed:
          (refreshedProfile as { onboarding_completed?: unknown } | null)?.onboarding_completed ?? null,
      });
      if (refreshedProfile) {
        SPLovePhotoLog.profileLoadSuccess({
          source: "Onboarding.submit.refetchProfile",
          userId: authUserId,
          profileRow: refreshedProfile as unknown as Record<string, unknown>,
        });
      } else {
        SPLovePhotoLog.profileLoadEmpty({
          source: "Onboarding.submit.refetchProfile",
          userId: authUserId,
          error: "refetchProfile_returned_null",
        });
      }

      function rowFlagsOnboardingDone(row: unknown): boolean {
        if (!row || typeof row !== "object") return false;
        const r = row as Record<string, unknown>;
        return (
          r.profile_completed === true ||
          r.onboarding_completed === true ||
          r.onboarding_done === true
        );
      }

      const gateOk =
        rowFlagsOnboardingDone(effectiveProfileReloadRow) ||
        rowFlagsOnboardingDone(refreshedProfile) ||
        rowFlagsOnboardingDone(upsertRow);
      if (!gateOk) {
        logValidationDiagnostics("blocked_post_upsert_gate", {
          profilePayloadForAudit: (effectiveProfileReloadRow ?? upsertRow) as Record<string, unknown>,
          profileSportsRowCount: selectedSportIds.length,
          blockReason: t("onboarding_error_profile_gate"),
          extra: {
            upsertRow_flags: upsertRow,
            refreshed_profile_completed: refreshedProfile?.profile_completed ?? null,
          },
        });
        console.error("[Onboarding submit] verdict: upsert OK + select OK but gating KO");
        console.error("[Onboarding submit] gating incomplet après upsert — détail diagnostic", {
          profile_completed: upsertRow.profile_completed,
          upsert_onboarding_completed: (upsertRow as { onboarding_completed?: unknown }).onboarding_completed ?? null,
          upsert_onboarding_done: (upsertRow as { onboarding_done?: unknown }).onboarding_done ?? null,
          reload_profile_completed:
            (effectiveProfileReloadRow as { profile_completed?: unknown } | null)?.profile_completed ?? null,
          refreshed_profile_completed: refreshedProfile?.profile_completed ?? null,
          refreshed_onboarding_completed:
            (refreshedProfile as { onboarding_completed?: unknown } | null)?.onboarding_completed ?? null,
          birth_date: upsertRow.birth_date,
        });
        setError(t("onboarding_error_profile_gate"));
        return;
      }

      void tryCompletePendingReferral(authUserId).then((r) => {
        if (r.ok) void refetchProfile();
      });

      let sessionOk = await syncAuthSession();
      if (!sessionOk) {
        await new Promise((r) => setTimeout(r, 400));
        sessionOk = await syncAuthSession();
      }
      if (!sessionOk) {
        logDetailedError("syncAuthSession after success", new Error("No session after success"));
        navigate("/auth", { replace: true });
        return;
      }

      const commitBaseRow =
        effectiveProfileReloadRow ??
        (refreshedProfile as Record<string, unknown> | null) ??
        (upsertRow as Record<string, unknown>) ??
        (completionWrite.row ?? {});
      let rowForCommit = mergeOnboardingPhotosIntoProfileRow(
        mergeProfileRowPreservingCompletion(
          { ...profilePayload, id: authUserId },
          commitBaseRow as Record<string, unknown>,
        ),
        portraitUrl,
        fullbodyUrl,
      );
      rowForCommit = mergeProfileRowPreservingCompletion(rowForCommit, {
        profile_completed: true,
        onboarding_completed: true,
        onboarding_done: true,
        accepted_terms_at: acceptTerms ? nowIso : rowForCommit.accepted_terms_at,
        accepted_privacy_at: acceptTerms ? nowIso : rowForCommit.accepted_privacy_at,
      });

      const reloadedAfterSubmit = await fetchProfileAfterOnboardingSubmit(supabase, authUserId);
      if (reloadedAfterSubmit) {
        rowForCommit = mergeProfileRowPreservingCompletion(
          rowForCommit,
          mergeOnboardingPhotosIntoProfileRow(reloadedAfterSubmit, portraitUrl, fullbodyUrl),
        );
      }

      if (!profileRowOnboardingComplete(rowForCommit)) {
        const healCompletion = await ensureOnboardingCompletionInProfile(
          supabase,
          authUserId,
          acceptTerms ? nowIso : new Date().toISOString(),
          "Onboarding.submit.preNavigateHeal",
        );
        if (healCompletion.row) {
          rowForCommit = mergeProfileRowPreservingCompletion(rowForCommit, healCompletion.row);
        }
        const reloadedHeal = await fetchProfileAfterOnboardingSubmit(supabase, authUserId);
        if (reloadedHeal) {
          rowForCommit = mergeProfileRowPreservingCompletion(rowForCommit, reloadedHeal);
        }
      }

      if (isProfileRecord(rowForCommit)) {
        commitProfileRow(rowForCommit);
      } else if (isProfileRecord(upsertRow)) {
        commitProfileRow(upsertRow);
      }

      const screenRow = await fetchProfileScreenFields(authUserId);
      if (screenRow && isProfileRecord(rowForCommit)) {
        const withPhotos = mergeOnboardingPhotosIntoProfileRow(screenRow, portraitUrl, fullbodyUrl);
        commitProfileRow(mergeProfileRowPreservingCompletion(rowForCommit, withPhotos));
      }

      const readinessRow = (reloadedAfterSubmit ??
        effectiveProfileReloadRow ??
        refreshedProfile ??
        upsertRow ??
        rowForCommit) as unknown as Record<string, unknown>;
      const { count: discoverSportRowCount, error: discoverSportCountErr } = await supabase
        .from("profile_sports")
        .select("sport_id", { count: "exact", head: true })
        .eq("profile_id", authUserId);

      if (discoverSportCountErr) {
        console.warn("[Onboarding audit] discover readiness (submit_final): comptage profile_sports échoué", {
          profile_id: authUserId,
          onboarding_ui_step_when_checked: TOTAL_STEPS,
          error_message: discoverSportCountErr.message,
        });
        setError(t("onboarding_discover_readiness_blocked"));
        return;
      }

      const readiness = auditOnboardingProfileForDiscover(readinessRow, discoverSportRowCount ?? 0);
      if (!readiness.ok) {
        console.warn("[Onboarding audit] discover readiness bloque la redirection Discover après submit", {
          profile_id: authUserId,
          missing_fields: readiness.missingFields,
          suggested_step: readiness.suggestedStep,
          context: "submit_final",
        });
        const flagOnlyMissing = readiness.missingFields.every((f) =>
          ["profile_completed", "onboarding_completed", "onboarding_done"].includes(f),
        );
        if (flagOnlyMissing) {
          const healCompletion = await ensureOnboardingCompletionInProfile(
            supabase,
            authUserId,
            acceptTerms ? nowIso : new Date().toISOString(),
            "Onboarding.submit.readinessFlagHeal",
          );
          if (healCompletion.row && isProfileRecord(rowForCommit)) {
            commitProfileRow(
              mergeProfileRowPreservingCompletion(rowForCommit, healCompletion.row),
            );
          }
        } else {
          setStep(readiness.suggestedStep);
          setError(messageForDiscoverReadinessGap(readiness.missingFields, t));
          return;
        }
      }

      if (!profileRowOnboardingComplete(rowForCommit)) {
        setError(t("onboarding_error_profile_gate"));
        OnboardingFlowLog.redirectDecision({
          userId: authUserId,
          target: "/onboarding",
          reason: "completion_flags_missing_after_submit",
          profile_completed: rowForCommit.profile_completed === true,
          onboarding_completed: rowForCommit.onboarding_completed === true,
          onboarding_done: rowForCommit.onboarding_done === true,
        });
        return;
      }

      if (moderationBanner) {
        await new Promise((r) => window.setTimeout(r, 1400));
      }
      console.log("[Onboarding submit] success → move");
      clearOnboardingUiLocalCache();
      clearProfilePhotoResolutionCache();
      void offerPushNotificationsAfterOnboarding(authUserId);
      OnboardingFlowLog.redirectDecision({
        userId: authUserId,
        target: "/move",
        reason: "onboarding_submit_success",
        profile_completed: rowForCommit.profile_completed === true,
        onboarding_completed: rowForCommit.onboarding_completed === true,
        onboarding_done: rowForCommit.onboarding_done === true,
      });
      navigate("/move", { replace: true });
    } catch (err) {
      logDetailedError("handleSubmit catch", err);
      console.error("ONBOARDING_SAVE_ERROR", err);
      console.error("[Onboarding submit] erreur technique (catch)", err);
      setError(t("onboarding_error_profile_gate"));
    } finally {
      onboardingSubmitInFlightRef.current = false;
      console.log("[Onboarding submit] end");
      setLoading(false);
    }
  }

  const intentChoiceClass = (active: boolean) =>
    `rounded-2xl border-2 py-3.5 px-3 text-sm font-semibold transition-all duration-200 active:scale-[0.99] sm:text-base ${
      active
        ? "shadow-md ring-2 ring-offset-1 ring-offset-app-card"
        : "border-app-border bg-app-card text-app-text hover:border-app-border/90 hover:bg-app-bg/40"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-app-bg font-sans">
      <GlobalHeader variant="compact" />
      <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-2">
        <div className="splove-onboarding-shell flex w-full max-w-md flex-1 flex-col overflow-hidden rounded-[1.35rem] bg-app-card shadow-[0_12px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06] sm:my-2 sm:max-h-[min(700px,calc(100vh-84px))]">
          <div className="shrink-0 border-b border-app-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
            <div
              className="mb-2 flex items-center justify-end"
              role="group"
              aria-label={t("onboarding_language_gate_title")}
            >
              <div className="inline-flex items-center gap-0.5 rounded-full border border-app-border/70 bg-app-bg/60 px-1 py-0.5 text-[11px] font-semibold tracking-wider">
                <button
                  type="button"
                  onClick={() => setLanguage("fr")}
                  aria-pressed={language === "fr"}
                  aria-label="Français"
                  className="rounded-full px-2 py-1 transition-colors active:scale-[0.97]"
                  style={{
                    background: language === "fr" ? BRAND_BG : "transparent",
                    color: language === "fr" ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                  }}
                >
                  FR
                </button>
                <span aria-hidden className="text-app-muted/40">
                  |
                </span>
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  aria-pressed={language === "en"}
                  aria-label="English"
                  className="rounded-full px-2 py-1 transition-colors active:scale-[0.97]"
                  style={{
                    background: language === "en" ? BRAND_BG : "transparent",
                    color: language === "en" ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                  }}
                >
                  EN
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">
              <span>
                {t("onboarding_step_word")} {step}/{TOTAL_STEPS}
                {step === 1 ? ` · ${step1SubStep + 1}/5` : ""}
              </span>
              <span className="tabular-nums opacity-90">{Math.round((step / TOTAL_STEPS) * 100)}%</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-app-border/70">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: BRAND_BG }}
                initial={false}
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold leading-snug text-app-muted">
              {t("onboarding_profile_fill_line", { pct: onboardingProfileFillPct })}
            </p>

            <div className="mt-2.5 flex flex-col items-center">
              <div className="flex max-w-full items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-app-bg ring-1 ring-app-border">
                  <img
                    src="/logo.png"
                    alt={t("app_name")}
                    className="h-8 w-8 max-h-full max-w-full object-contain opacity-[0.92]"
                  />
                </div>
                <p
                  className="truncate text-2xl font-bold tracking-tight sm:text-3xl sm:tracking-tight"
                  style={{ color: BRAND_BG }}
                >
                  SPLove
                </p>
              </div>
              {step <= 3 ? null : (
                <p className="mt-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-app-muted">
                  {t("onboarding_header_profile_badge")}
                </p>
              )}
            </div>

            <h1 className="mt-5 text-center text-[1.28rem] font-bold leading-[1.22] tracking-tight text-app-text sm:text-xl">
              {step === 1
                ? t(
                    [
                      "onboarding_step1_micro_name_title",
                      "onboarding_step1_micro_birth_title",
                      "onboarding_step1_micro_age_pref_title",
                      "onboarding_step1_micro_height_title",
                      "onboarding_step1_micro_family_title",
                    ][step1SubStep] ?? "onboarding_step1_title",
                  )
                : null}
              {step === 2 && t("onboarding_step2_title")}
              {step === 3 && t("onboarding_step3_title")}
              {step === 4 && t("onboarding_step4_title")}
              {step === 5 && t("onboarding_sports_title")}
              {step === 6 && t("sport_match_pref_section_title")}
              {step === 7 && t("onboarding_intention_title")}
              {step === 8 && t("onboarding_adapted_title")}
              {step === 9 && t("onboarding_photos_hero_title")}
              {step === 10 && t("onboarding_bio_hero_title")}
              {step === 11 && t("onboarding_final_hero_title")}
            </h1>
            <p className="mx-auto mt-3 max-w-[20rem] text-center text-[14px] leading-relaxed text-app-muted sm:max-w-[22rem] sm:text-[15px]">
              {step === 1
                ? t(
                    [
                      "onboarding_step1_micro_name_subtitle",
                      "onboarding_step1_micro_birth_subtitle",
                      "onboarding_step1_micro_age_pref_subtitle",
                      "onboarding_step1_micro_height_subtitle",
                      "onboarding_step1_micro_family_subtitle",
                    ][step1SubStep] ?? "onboarding_step1_subtitle",
                  )
                : null}
              {step === 2 && t("onboarding_step2_subtitle")}
              {step === 3 && t("onboarding_step3_subtitle")}
              {step === 4 && t("onboarding_step4_subtitle")}
              {step === 5 && t("onboarding_sports_subtitle")}
              {step === 6 && t("sport_match_pref_section_hint")}
              {step === 7 && t("onboarding_intention_subtitle")}
              {step === 8 && t("onboarding_adapted_subtitle")}
              {step === 9 && t("onboarding_photos_hero_subtitle")}
              {step === 10 && t("onboarding_bio_hero_subtitle")}
              {step === 11 && t("onboarding_final_hero_subtitle")}
            </p>
            <p className="mx-auto mt-4 max-w-[21rem] text-center text-[12px] font-medium italic leading-relaxed text-app-muted/80">
              {step === 1
                ? t(`onboarding_pulse_step_1_micro_${step1SubStep}`)
                : t(onboardingPulseKey(step))}
            </p>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={step === TOTAL_STEPS ? handleSubmit : (e) => e.preventDefault()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${step}-${step === 1 ? step1SubStep : 0}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className="will-change-[opacity,transform]"
                >
              {step === 1 && (
                <div className="space-y-9 pb-2 pt-1">
                  {step1SubStep === 0 ? (
                    <div>
                      <label className={labelClassName} htmlFor="ob-first">
                        {t("first_name_required")}
                      </label>
                      <input
                        id="ob-first"
                        type="text"
                        placeholder={t("first_name_placeholder")}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                        className={inputClassName}
                      />
                    </div>
                  ) : null}
                  {step1SubStep === 1 ? (
                    <div>
                      <label className={labelClassName} htmlFor="ob-birth">
                        {t("birth_date_required")}
                      </label>
                      <input
                        id="ob-birth"
                        type="text"
                        inputMode="numeric"
                        autoComplete="bday"
                        placeholder={t("birth_date_placeholder")}
                        maxLength={10}
                        value={birthInput}
                        onChange={handleBirthInputChange}
                        className={inputClassName}
                      />
                      {birthDigitsFromRaw(birthInput).length === 8 && !birthDate && (
                        <p className="mt-1 text-xs text-red-600">
                          {t("birth_date_invalid")} ({BIRTH_YEAR_MIN}-{new Date().getFullYear()}).
                        </p>
                      )}
                      {birthDate && !isAdultFromBirthIso(birthDate) && (
                        <p className="mt-1 text-xs text-red-600">{t("must_be_18")}</p>
                      )}
                    </div>
                  ) : null}
                  {step1SubStep === 2 ? (
                    <div className="space-y-4">
                      <p className="text-[13px] font-semibold leading-snug text-app-text">{t("meet_prefs_age_heading")}</p>
                      <p className="whitespace-pre-line text-[12px] leading-relaxed text-app-muted">
                        {t("meet_prefs_age_hint")}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClassName} htmlFor="ob-pref-age-min">
                            {t("meet_prefs_age_from_label")}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="ob-pref-age-min"
                              type="number"
                              inputMode="numeric"
                              min={PROFILE_MIN_VISIBLE_AGE}
                              max={130}
                              value={obPreferredAgeMinStr}
                              onChange={(e) => {
                                setStepHint(null);
                                setObPreferredAgeMinStr(e.target.value);
                              }}
                              aria-label={`${t("meet_prefs_age_from_label")} ${t("meet_prefs_age_unit")}`}
                              className={inputClassName}
                              style={{ flex: 1 }}
                            />
                            <span className="shrink-0 text-[13px] font-medium text-app-muted">
                              {t("meet_prefs_age_unit")}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className={labelClassName} htmlFor="ob-pref-age-max">
                            {t("meet_prefs_age_to_label")}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="ob-pref-age-max"
                              type="number"
                              inputMode="numeric"
                              min={PROFILE_MIN_VISIBLE_AGE}
                              max={130}
                              value={obPreferredAgeMaxStr}
                              onChange={(e) => {
                                setStepHint(null);
                                setObPreferredAgeMaxStr(e.target.value);
                              }}
                              aria-label={`${t("meet_prefs_age_to_label")} ${t("meet_prefs_age_unit")}`}
                              className={inputClassName}
                              style={{ flex: 1 }}
                            />
                            <span className="shrink-0 text-[13px] font-medium text-app-muted">
                              {t("meet_prefs_age_unit")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {step1SubStep === 3 ? (
                    <div>
                      <label className={labelClassName} htmlFor="ob-height">
                        {t("onboarding_height_label")}
                      </label>
                      <p className="mb-2 text-[12px] leading-relaxed text-app-muted">
                        {t("onboarding_step1_micro_height_hint")}
                      </p>
                      <input
                        id="ob-height"
                        type="number"
                        inputMode="numeric"
                        placeholder={t("onboarding_height_placeholder")}
                        min={PROFILE_HEIGHT_CM_MIN}
                        max={PROFILE_HEIGHT_CM_MAX}
                        step={1}
                        value={heightCmInput}
                        onChange={(e) => setHeightCmInput(e.target.value)}
                        autoComplete="off"
                        className={inputClassName}
                      />
                    </div>
                  ) : null}
                  {step1SubStep === 4 ? (
                    <div>
                      <span className={labelClassName}>{t("onboarding_children_label")}</span>
                      <p className="mb-2 text-[12px] leading-relaxed text-app-muted">
                        {t("onboarding_step1_micro_family_hint")}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(
                          [
                            ["yes", "onboarding_children_yes"],
                            ["no", "onboarding_children_no"],
                            ["prefer_not", "onboarding_children_prefer_not"],
                          ] as const
                        ).map(([value, labelKey]) => {
                          const active = hasChildrenChoice === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setHasChildrenChoice((prev) => (prev === value ? "" : value))
                              }
                              className="min-h-[44px] rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-all"
                              style={{
                                borderColor: active ? BRAND_BG : APP_BORDER,
                                background: active ? BRAND_BG : APP_CARD,
                                color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                              }}
                              aria-pressed={active}
                            >
                              {t(labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 pb-1">
                  <span className={labelClassName}>{t("gender_required")}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {genderOptions.map((o) => {
                      const active = gender === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setGender(o.value)}
                          className="min-h-[44px] rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-all"
                          style={{
                            borderColor: active ? BRAND_BG : APP_BORDER,
                            background: active ? BRAND_BG : APP_CARD,
                            color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                          }}
                          aria-pressed={active}
                        >
                          {t(o.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 pb-1">
                  <span className={labelClassName}>{t("interested_in_required")}</span>
                  <div
                    id="ob-look"
                    className="grid max-h-[min(52vh,22rem)] grid-cols-2 gap-2.5 overflow-y-auto pr-1"
                    role="group"
                    aria-label={t("interested_in_required")}
                  >
                    {INTERESTED_IN_OPTIONS_UI.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleInterestedInOption(o.value)}
                        className="min-h-[48px] rounded-2xl border-2 px-2.5 py-2 text-[13px] font-semibold transition-all duration-200 active:scale-[0.99]"
                        style={{
                          borderColor: interestedIn.includes(o.value) ? BRAND_BG : APP_BORDER,
                          background: interestedIn.includes(o.value) ? BRAND_BG : APP_CARD,
                          color: interestedIn.includes(o.value) ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                        }}
                        aria-pressed={interestedIn.includes(o.value)}
                      >
                        {t(o.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <label className={labelClassName} htmlFor="ob-loc-city">
                      {t("city")}
                    </label>
                    <input
                      id="ob-loc-city"
                      type="text"
                      placeholder={t("onboarding_city_example")}
                      value={obLocCity}
                      onChange={(e) => {
                        setObLocCity(e.target.value);
                        setObLocSource(null);
                        setObLocLat(null);
                        setObLocLng(null);
                      }}
                      autoComplete="address-level2"
                      className={inputClassName}
                    />
                    {obCitySuggestLoading ? (
                      <p className="mt-1.5 text-xs text-app-muted">{t("loading")}</p>
                    ) : null}
                    {obCitySuggestions.length > 0 ? (
                      <ul
                        className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-app-border bg-app-card py-1 text-sm shadow-sm"
                        role="listbox"
                        aria-label={t("city")}
                      >
                        {obCitySuggestions.map((sug, sugIdx) => (
                          <li
                            key={`${sug.lat}-${sug.lng}-${String(sug.country ?? "")}-${sugIdx}`}
                          >
                            <button
                              type="button"
                              className="w-full px-3 py-2.5 text-left font-medium text-app-text hover:bg-app-border/60"
                              onClick={() => {
                                const shortLabel =
                                  (sug.locality && sug.locality.trim()) ||
                                  normalizePrimaryLocalityLabel(sug.label) ||
                                  sug.label.split(",")[0]?.trim() ||
                                  sug.label.trim();
                                setObLocCity(shortLabel);
                                setObLocLat(sug.lat);
                                setObLocLng(sug.lng);
                                setObLocSource("manual");
                                setObCitySuggestions([]);
                                setStepHint(null);
                              }}
                            >
                              {formatCitySuggestionListLabel(obCitySuggestions, sugIdx)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs leading-snug text-app-muted">{t("location_city_pick_list_helper")}</p>
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ob-loc-radius">
                      {t("radius")}
                    </label>
                    <select
                      id="ob-loc-radius"
                      value={obLocRadiusKm}
                      onChange={(e) => setObLocRadiusKm(Number(e.target.value))}
                      className={inputClassName}
                    >
                      {ONBOARDING_RADIUS_KM_OPTIONS.map((km) => (
                        <option key={km} value={km}>
                          {`${km} ${t("km")}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={obLocGeoLoading}
                    onClick={() => void handleObUseDeviceLocation()}
                    className="w-full rounded-xl border border-app-border bg-app-bg py-2.5 text-sm font-semibold text-app-text transition hover:bg-app-border disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {obLocGeoLoading ? t("loading") : t("use_current_location")}
                  </button>
                  {!locationReady ? (
                    <p className="text-xs font-semibold leading-snug text-amber-900/95" role="status">
                      {obLocCity.trim().length < 2
                        ? t("onboarding_err_city")
                        : ![10, 25, 50, 100].includes(obLocRadiusKm)
                          ? t("onboarding_err_radius")
                          : t("onboarding_city_pick_list_or_geo")}
                    </p>
                  ) : null}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-2.5">
                    <div
                      className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-app-border/90 bg-app-bg/90 px-6 py-2.5 shadow-sm ring-1 ring-white/[0.05]"
                      aria-live="polite"
                    >
                      <span className="text-[15px] font-bold tabular-nums tracking-tight" style={{ color: BRAND_BG }}>
                        {t("onboarding_sports_counter", {
                          current: selectedSportIds.length,
                          max: ONBOARDING_SPORT_SLOT_MAX,
                        })}
                      </span>
                    </div>
                    <p className="max-w-[18rem] text-center text-[12px] leading-relaxed text-app-muted">
                      {t("onboarding_sports_hint")}
                    </p>
                  </div>

                  {sportsLoadError ? (
                    <p className="rounded-2xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs leading-snug text-amber-950">
                      {sportsLoadError}
                    </p>
                  ) : null}

                  {selectedSports.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {selectedSports.map((s) => (
                        <motion.button
                          key={String(s.id)}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleSportById(s.id)}
                          className="rounded-full border-2 px-3.5 py-2 text-xs font-semibold shadow-sm transition-shadow"
                          style={{
                            borderColor: BRAND_BG,
                            background: BRAND_BG,
                            color: TEXT_ON_BRAND,
                          }}
                        >
                          <span>{s.name}</span>
                          <span className="ml-1 opacity-90" aria-hidden>
                            ×
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  )}
                  {quickPickSportsOrdered.length > 0 ? (
                    <div className="space-y-3">
                      <span className="block text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                        {t("onboarding_sports_quick_section")}
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {quickPickSportsOrdered.map((sport) => {
                          const isSelected = selectedSportIds.some((id) => String(id) === String(sport.id));
                          const picto = sportPictogramForSlug(sport.slug ?? null);
                          return (
                            <motion.button
                              key={String(sport.id)}
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              onClick={() => toggleSportById(sport.id)}
                              className="flex min-h-[56px] w-full items-stretch overflow-hidden rounded-2xl border-2 text-left transition-shadow duration-200"
                              style={{
                                borderColor: isSelected ? BRAND_BG : APP_BORDER,
                                background: isSelected ? BRAND_BG : APP_CARD,
                                color: isSelected ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                                boxShadow: isSelected
                                  ? "0 10px 28px rgba(0,0,0,0.28), 0 0 0 1px rgba(225,29,46,0.12)"
                                  : "0 4px 16px rgba(0,0,0,0.12)",
                              }}
                              aria-pressed={isSelected}
                            >
                              <span
                                className="flex w-12 shrink-0 items-center justify-center text-[1.15rem] leading-none"
                                style={{
                                  background: isSelected ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.04)",
                                }}
                                aria-hidden
                              >
                                {picto}
                              </span>
                              <span className="flex flex-1 items-center px-2.5 py-3 text-[13px] font-semibold leading-snug">
                                {sport.name}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  ) : !loadingSports && sportsCatalog.length === 0 && !sportsLoadError ? (
                    <p className="text-center text-xs text-app-muted">{t("onboarding_sports_catalog_unavailable")}</p>
                  ) : null}

                  <div>
                    <label className={labelClassName} htmlFor="ob-sport-search">
                      {t("search_sport")}
                    </label>
                    <input
                      id="ob-sport-search"
                      type="search"
                      autoComplete="off"
                      placeholder={t("onboarding_sports_search_placeholder")}
                      value={sportSearch}
                      onChange={(e) => setSportSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTypedSport();
                        }
                      }}
                      className={inputClassName}
                    />
                    {sportSearch.trim().length > 0 && sportSearch.trim().length < 3 && (
                      <p className="mt-2 text-xs text-app-muted">{t("sport_search_min_letters", { n: 3 - sportSearch.trim().length })}</p>
                    )}
                    {searchMatches.length > 0 && (
                      <ul
                        className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-app-border bg-app-card text-sm shadow-md ring-1 ring-white/[0.04]"
                        role="listbox"
                      >
                        {searchMatches.map((s) => (
                          <li key={String(s.id)}>
                            <button
                              type="button"
                              className="w-full px-3 py-2.5 text-left transition-colors hover:bg-app-border"
                              onClick={() => {
                                toggleSportById(s.id);
                                setSportSearch("");
                              }}
                            >
                              {s.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {loadingSports ? (
                    <p className="text-center text-sm text-app-muted">{t("loading_sports_catalog")}</p>
                  ) : null}
                </div>
              )}

              {step === 6 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    {ONBOARDING_SPORT_MATCH_OPTIONS.map((opt) => {
                      const active = sportMatchPreference === opt.value;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setSportMatchPreference(opt.value)}
                          className={`${intentChoiceClass(active)} min-h-[56px] w-full text-left`}
                          style={
                            active
                              ? {
                                  borderColor: BRAND_BG,
                                  background: BRAND_BG,
                                  color: TEXT_ON_BRAND,
                                  ["--tw-ring-color" as string]: BRAND_BG,
                                }
                              : undefined
                          }
                        >
                          <span className="block text-base font-semibold">{t(opt.labelKey)}</span>
                          <span
                            className={`mt-1 block text-[13px] font-medium leading-snug ${active ? "opacity-90" : "text-app-muted"}`}
                          >
                            {t(opt.descKey)}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    {ONBOARDING_INTENT_CARDS.map((card) => {
                      const active = intent === card.uiValue;
                      return (
                        <motion.button
                          key={card.uiValue}
                          type="button"
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setIntent(card.uiValue)}
                          className={`${intentChoiceClass(active)} min-h-[56px] w-full`}
                          style={
                            active
                              ? {
                                  borderColor: BRAND_BG,
                                  background: BRAND_BG,
                                  color: TEXT_ON_BRAND,
                                  ["--tw-ring-color" as string]: BRAND_BG,
                                }
                              : undefined
                          }
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="text-base font-semibold">{t(card.translationKey)}</span>
                            <span className="text-base font-semibold" style={{ opacity: active ? 1 : 0 }}>
                              ✓
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 8 && (
                <div className="space-y-6 pb-1">
                  <div>
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={labelClassName}>{t("onboarding_adapted_q1")}</span>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
                        {t("onboarding_adapted_q1_optional")}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          ["yes", "onboarding_adapted_am_yes"],
                          ["no", "onboarding_adapted_am_no"],
                          ["prefer_not", "onboarding_adapted_am_prefer_not"],
                        ] as const
                      ).map(([value, labelKey]) => {
                        const active = adaptedAmenagements === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAdaptedAmenagements(value)}
                            className="min-h-[44px] rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-all"
                            style={{
                              borderColor: active ? BRAND_BG : APP_BORDER,
                              background: active ? BRAND_BG : APP_CARD,
                              color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                            }}
                            aria-pressed={active}
                          >
                            {t(labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className={`${labelClassName} flex items-center gap-2`}>
                      <Accessibility
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-app-muted"
                      />
                      <span>{t("onboarding_adapted_q2")}</span>
                    </span>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {(
                        [
                          ["yes_totally", "onboarding_adapted_open_yes_total"],
                          ["yes_depends_sport", "onboarding_adapted_open_yes_sport"],
                          ["no", "onboarding_adapted_open_no"],
                        ] as const
                      ).map(([value, labelKey]) => {
                        const active = openToAdaptedPractice === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setOpenToAdaptedPractice(value)}
                            className="min-h-[48px] w-full rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition-all sm:text-[15px]"
                            style={{
                              borderColor: active ? BRAND_BG : APP_BORDER,
                              background: active ? BRAND_BG : APP_CARD,
                              color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                            }}
                            aria-pressed={active}
                          >
                            {t(labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 9 && (
                <div className="space-y-4">
                  <p className="px-0.5 text-xs leading-snug text-app-muted">{t("onboarding_photo_help_hint")}</p>
                  {photoStepDraftSaving ? (
                    <p className="px-0.5 text-xs font-medium text-app-muted" aria-live="polite">
                      {t("onboarding_photo_saving_persist")}
                    </p>
                  ) : photoUploadingKind ? (
                    <p className="px-0.5 text-xs font-medium text-app-muted" aria-live="polite">
                      {t("onboarding_photo_upload_progress")}
                    </p>
                  ) : null}
                  {photoStepError && !photoUploadingKind && !photoStepDraftSaving ? (
                    <p className="px-0.5 text-xs font-medium leading-snug" style={{ color: BRAND_BG }} role="alert">
                      {photoStepError}
                    </p>
                  ) : null}

                  <div className="space-y-3">
                    <div>
                      <span className={labelClassName}>{t("onboarding_photo_face")}</span>
                      <p className="mb-1.5 text-[11px] text-app-muted">{t("onboarding_photo_face_hint")}</p>
                      <input
                        ref={portraitInputRef}
                        id="ob-photo-portrait"
                        type="file"
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        onChange={(e) => {
                          void assignPhotoFile(e.target.files?.[0], "portrait");
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="ob-photo-portrait"
                        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-dashed border-app-border bg-app-bg/80 text-center transition hover:border-app-border"
                      >
                        {portraitDisplayUrl && !portraitPreviewLoadFailed ? (
                          <img
                            src={portraitDisplayUrl}
                            alt={t("onboarding_photo_face_preview")}
                            className="aspect-[3/4] w-full max-w-[280px] mx-auto object-cover"
                            onLoad={() => {
                              if (portraitDisplayUrl.startsWith("blob:")) {
                                console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "face", phase: "render" });
                                return;
                              }
                              console.log("PHOTO_PREVIEW_REMOTE_OK", {
                                slot: "face",
                                facePhotoUrl: portraitSavedUrl || null,
                                phase: "render",
                              });
                            }}
                            onError={() => {
                              console.warn("PHOTO_PREVIEW_ERROR_FULL", {
                                slot: "face",
                                src: portraitDisplayUrl,
                                srcHasRedacted: portraitDisplayUrl.includes("[redacted"),
                                facePhotoUrl: portraitSavedUrl || null,
                                hasLocalFallback: Boolean(
                                  portraitLocalPreviewUrl || portraitPreviewUrl,
                                ),
                              });
                              console.warn("[profilePhoto] preview_image_error", {
                                slot: "face",
                                src: portraitDisplayUrl,
                                facePhotoUrl: portraitSavedUrl || null,
                              });
                              setPortraitPreviewLoadFailed(true);
                            }}
                          />
                        ) : (
                          <span className="flex aspect-[3/4] w-full max-w-[280px] mx-auto flex-col items-center justify-center gap-1 px-2 py-6">
                            <span className="text-xs font-semibold text-app-text">{t("add_photo")}</span>
                            <span className="text-[10px] text-app-muted">
                              {t("onboarding_photo_formats_hint_png_jpg_only", { maxMb: ONBOARDING_PHOTO_MAX_MB })}
                            </span>
                          </span>
                        )}
                      </label>
                      {portraitDisplayUrl ? (
                        <button
                          type="button"
                          onClick={() => portraitInputRef.current?.click()}
                          className="mt-2 w-full max-w-[280px] mx-auto rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                        >
                          {t("replace_photo")}
                        </button>
                      ) : null}
                      {photoUploadingKind === "portrait" ? (
                        <p className="mt-1 text-center text-[12px] font-medium text-app-muted">{t("onboarding_photo_upload_progress")}</p>
                      ) : null}
                    </div>

                    <div>
                      <span className={labelClassName}>{t("onboarding_photo_activity")}</span>
                      <p className="mb-1.5 text-[11px] text-app-muted">{t("onboarding_photo_activity_hint")}</p>
                      <input
                        ref={bodyInputRef}
                        id="ob-photo-body"
                        type="file"
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        onChange={(e) => {
                          void assignPhotoFile(e.target.files?.[0], "body");
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="ob-photo-body"
                        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-dashed border-app-border bg-app-bg/80 text-center transition hover:border-app-border"
                      >
                        {bodyDisplayUrl && !bodyPreviewLoadFailed ? (
                          <img
                            src={bodyDisplayUrl}
                            alt={t("onboarding_photo_activity_preview")}
                            className="aspect-[3/4] w-full max-w-[280px] mx-auto object-cover"
                            onLoad={() => {
                              if (bodyDisplayUrl.startsWith("blob:")) {
                                console.log("PHOTO_PREVIEW_LOCAL_OK", { slot: "activity", phase: "render" });
                                return;
                              }
                              console.log("PHOTO_PREVIEW_REMOTE_OK", {
                                slot: "activity",
                                activityPhotoUrl: bodySavedUrl || null,
                                phase: "render",
                              });
                            }}
                            onError={() => {
                              console.warn("PHOTO_PREVIEW_ERROR_FULL", {
                                slot: "activity",
                                src: bodyDisplayUrl,
                                srcHasRedacted: bodyDisplayUrl.includes("[redacted"),
                                activityPhotoUrl: bodySavedUrl || null,
                                hasLocalFallback: Boolean(bodyLocalPreviewUrl || bodyPreviewUrl),
                              });
                              console.warn("[profilePhoto] preview_image_error", {
                                slot: "activity",
                                src: bodyDisplayUrl,
                                activityPhotoUrl: bodySavedUrl || null,
                              });
                              setBodyPreviewLoadFailed(true);
                            }}
                          />
                        ) : (
                          <span className="flex aspect-[3/4] w-full max-w-[280px] mx-auto flex-col items-center justify-center gap-1 px-2 py-6">
                            <span className="text-xs font-semibold text-app-text">{t("add_photo")}</span>
                            <span className="text-[10px] text-app-muted">
                              {t("onboarding_photo_formats_hint_png_jpg_only", { maxMb: ONBOARDING_PHOTO_MAX_MB })}
                            </span>
                          </span>
                        )}
                      </label>
                      {bodyDisplayUrl ? (
                        <button
                          type="button"
                          onClick={() => bodyInputRef.current?.click()}
                          className="mt-2 w-full max-w-[280px] mx-auto rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                        >
                          {t("replace_photo")}
                        </button>
                      ) : null}
                      {photoUploadingKind === "body" ? (
                        <p className="mt-1 text-center text-[12px] font-medium text-app-muted">{t("onboarding_photo_upload_progress")}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {step === 10 && (
                <div className="space-y-3">
                  <label className={labelClassName} htmlFor="ob-sport-phrase">
                    {t("sport_phrase.title")}
                  </label>
                  <p className="text-xs leading-snug text-app-muted">{t("sport_phrase.description")}</p>
                  <textarea
                    id="ob-sport-phrase"
                    rows={4}
                    value={sportPhraseOptional}
                    onChange={(e) => setSportPhraseOptional(e.target.value)}
                    placeholder={t("sport_phrase.placeholder")}
                    className={`${inputClassName} min-h-[100px] resize-y`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void goNext()}
                    className="text-sm font-medium text-app-muted underline underline-offset-2"
                  >
                    {t("skip")}
                  </button>
                </div>
              )}

              {step === 11 && (
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-app-border bg-app-bg/60 px-3 py-3 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={confirm18}
                      onChange={(e) => setConfirm18(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-app-border"
                    />
                    <span>{t("confirm_18_plus")}</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-app-border bg-app-bg/60 px-3 py-3 text-sm text-app-text">
                    <input
                      id="ob-accept-terms"
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-app-border"
                    />
                    <span>
                      <span className="sr-only">{t("accept_terms_privacy")}</span>
                      {t("accept_terms_privacy_prefix")}
                      <a
                        href="#/cgu"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {t("accept_terms_privacy_terms_link")}
                      </a>
                      {t("accept_terms_privacy_mid")}
                      <a
                        href="#/privacy"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {t("accept_terms_privacy_privacy_link")}
                      </a>
                      {t("accept_terms_privacy_suffix")}
                    </span>
                  </label>
                </div>
              )}

                </motion.div>
              </AnimatePresence>

              {stepHint && step !== 9 && (
                <p className="mt-3 text-sm text-red-600">{stepHint}</p>
              )}
              {finalStepBlockReason && (
                <p className="mt-3 text-sm text-red-600">{finalStepBlockReason}</p>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              {optionalProfileWarning && (
                <p className="mt-3 text-sm text-amber-700">{optionalProfileWarning}</p>
              )}
              {moderationSuccessNote && (
                <p className="mt-3 text-sm font-medium text-emerald-700">{moderationSuccessNote}</p>
              )}
            </div>

            <div className="shrink-0 border-t border-app-border bg-app-card px-4 py-3.5 sm:px-5 sm:py-4">
              {step === TOTAL_STEPS && (
                <p className="mb-2 text-center text-xs font-medium text-app-muted">
                  {t("onboarding_final_cta_ready")}
                </p>
              )}
              <div className="flex gap-3">
                {step > 1 || (step === 1 && step1SubStep > 0) ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex-1 rounded-2xl border border-app-border py-3.5 text-sm font-semibold text-app-text transition-colors hover:bg-app-border active:scale-[0.99]"
                  >
                    {t("back")}
                  </button>
                ) : (
                  <span className="flex-1" aria-hidden />
                )}
                {step < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={() => void goNext()}
                    disabled={
                      authLoading ||
                      photoStepDraftSaving ||
                      (step === 9 && photoUploadingKind !== null) ||
                      (step === 4 && !locationReady)
                    }
                    className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white shadow-md transition-[transform,box-shadow] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
                  >
                    {step === 9 && photoStepDraftSaving
                      ? t("onboarding_next_please_wait")
                      : step === 4
                        ? t("onboarding_cta_save_location")
                        : step === 5
                          ? t("continue")
                          : step === 10
                            ? t("continue")
                            : t("next")}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading || authLoading || hydratingDraft || !canSubmit}
                    className="flex-1 rounded-2xl py-3.5 text-sm font-semibold shadow-md transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
                    style={{
                      background: !loading && !authLoading && user?.id ? BRAND_BG : CTA_DISABLED_BG,
                      color: TEXT_ON_BRAND,
                    }}
                  >
                    {loading ? t("onboarding_final_validating") : t("onboarding_final_cta_go")}
                  </button>
                )}
              </div>
              {hydratingDraft ? (
                <p className="mt-2 text-xs text-app-muted" aria-live="polite">
                  {t("onboarding_hydrating")}
                </p>
              ) : null}
              {env.appEnv !== "production" && env.veriffPublicKey ? (
                <p className="mt-2 text-xs text-app-muted">
                  {t("onboarding_dev_veriff_note")}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
