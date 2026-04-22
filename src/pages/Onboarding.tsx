import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { env } from "../lib/env";
import { useAuth } from "../contexts/AuthContext";
import { GlobalHeader } from "../components/GlobalHeader";
import { SplashScreen } from "../components/SplashScreen";
import {
  ACCESSIBILITY_SECTION_INTRO,
  ONBOARDING_AVATAR_REQUIRED,
  ONBOARDING_FULLBODY_REQUIRED,
} from "../constants/copy";
import { isAdultFromBirthIso } from "../lib/ageGate";
import { isOnboardingComplete } from "../lib/profileCompleteness";
import {
  ONBOARDING_PROFILE_HYDRATE_TIERS,
  PROFILE_UPSERT_ONBOARDING_SELECT,
  PROFILE_UPSERT_ONBOARDING_SELECT_CORE,
  isUndefinedColumnError,
  selectProfilesFirstMatch,
} from "../lib/profileSelect";
import { isProfileRecord } from "../lib/appProfile";
import { reverseGeocodeCity } from "../lib/geocoding";
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

const GENDER_OPTIONS = [
  { value: "Femme", label: "Femme" },
  { value: "Homme", label: "Homme" },
  { value: "Non-binaire", label: "Non-binaire" },
] as const;

const INTERESTED_IN_OPTIONS = [
  { value: "Homme", label: "Homme" },
  { value: "Femme", label: "Femme" },
  { value: "Tous", label: "Tous" },
] as const;

/** Préférence horaire onboarding (tap) — stockée dans `sport_time`. */
const ONBOARDING_TIME_QUICK_OPTIONS = [
  { value: "Matin", label: "Matin" },
  { value: "Soir", label: "Soir" },
] as const;

const ONBOARDING_INTENSITY_QUICK_OPTIONS = [
  { value: "chill", label: "Chill" },
  { value: "intense", label: "Intense" },
] as const;

/** Aligné `profileCompleteness` + migration 068 */
const ORGANIZATION_OPTIONS = [
  { value: "spontaneous", label: "Spontané" },
  { value: "planned", label: "Planifié" },
] as const;

const OPTIONAL_PROFILE_WARNING_MESSAGE =
  "Certaines données optionnelles n’ont pas pu être enregistrées, mais vous pouvez continuer.";
const OPTIONAL_PROFILE_COLUMNS = [
  "onboarding_sports_count",
  "onboarding_sports_with_level_count",
  "location_source",
  "sport_intensity",
  "meet_vibe",
  "planning_style",
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

/** Ordre de retrait défensif + mapping legacy (schéma mixte prod). */
const PROD_SANITIZE_AGGRESSIVE_STRIP_ORDER = [
  "practice_preferences",
  "looking_for",
  "sport_time",
  "main_photo_url",
  "portrait_url",
  "fullbody_url",
] as const;

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
    if (faulty) {
      delete next[faulty];
      applyLegacyMappingAfterRemoval(faulty, next, ctx);
    }
    return next;
  }
  const key = PROD_SANITIZE_AGGRESSIVE_STRIP_ORDER[aggressivePhase];
  if (key) {
    delete next[key];
    applyLegacyMappingAfterRemoval(key, next, ctx);
  }
  return next;
}

/** Valeurs BDD existantes (`profiles.intent`) — ne pas casser Discover/Matching. */
const INTENT_DB_AMOUR = "Amoureux";
const INTENT_DB_AMICAL = "Amical";

type OnboardingIntentUiValue = "dating_feeling" | "sport_social" | "both";

type OnboardingIntentCard = {
  uiValue: OnboardingIntentUiValue;
  title: string;
};

const ONBOARDING_INTENT_CARDS: OnboardingIntentCard[] = [
  { uiValue: "dating_feeling", title: "Rencontre + feeling" },
  { uiValue: "sport_social", title: "Rencontres sportives" },
  { uiValue: "both", title: "Les deux" },
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

type SportOption = { id: string | number; name: string; slug?: string };

/** Clé de comparaison insensible aux accents / casse / ponctuation (fallback si slug BDD ≠ catalogues). */
function normCompact(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Sports majeurs affichés par défaut : ordre fixe, plusieurs slugs possibles par slot
 * (schéma 034 vs 042 : lignes séparées ou lignes combinées).
 * `featuredKey` garantit une clé React stable si deux slots pointent vers la même ligne BDD.
 * `chipLabel` : libellé produit affiché sur le chip (indépendant du label BDD une fois l’id résolu).
 * `matchNormCompacts` : formes `normCompact(label)` pour retrouver une ligne même si le slug est générique.
 */
const FEATURED_SPORT_SLOTS: {
  featuredKey: string;
  matchSlugs: string[];
  chipLabel: string;
  matchNormCompacts: string[];
}[] = [
  {
    featuredKey: "course-a-pied",
    matchSlugs: ["course-a-pied", "running"],
    chipLabel: "Course à pied",
    matchNormCompacts: ["courseapied", "running"],
  },
  {
    featuredKey: "marche",
    matchSlugs: ["marche", "marche-randonnee"],
    chipLabel: "Marche",
    matchNormCompacts: ["marche", "marcherandonnee"],
  },
  {
    featuredKey: "randonnee",
    matchSlugs: ["randonnee", "marche-randonnee"],
    chipLabel: "Randonnée",
    matchNormCompacts: ["randonnee", "marcherandonnee"],
  },
  { featuredKey: "tennis", matchSlugs: ["tennis"], chipLabel: "Tennis", matchNormCompacts: ["tennis"] },
  { featuredKey: "padel", matchSlugs: ["padel"], chipLabel: "Padel", matchNormCompacts: ["padel"] },
  {
    featuredKey: "fitness",
    matchSlugs: ["fitness", "fitness-musculation"],
    chipLabel: "Fitness",
    matchNormCompacts: ["fitness", "fitnessmusculation"],
  },
  {
    featuredKey: "musculation",
    matchSlugs: ["musculation", "fitness-musculation"],
    chipLabel: "Musculation",
    matchNormCompacts: ["musculation", "fitnessmusculation"],
  },
  { featuredKey: "skate", matchSlugs: ["skate"], chipLabel: "Skate", matchNormCompacts: ["skate"] },
  { featuredKey: "velo", matchSlugs: ["velo"], chipLabel: "Vélo", matchNormCompacts: ["velo"] },
  {
    featuredKey: "natation",
    matchSlugs: ["natation"],
    chipLabel: "Natation",
    matchNormCompacts: ["natation"],
  },
];

const DEFAULT_SPORT_FALLBACK: SportOption[] = [
  { id: "fallback-0", name: "Course à pied", slug: "course-a-pied" },
  { id: "fallback-1", name: "Marche", slug: "marche" },
  { id: "fallback-2", name: "Randonnée", slug: "randonnee" },
  { id: "fallback-3", name: "Tennis", slug: "tennis" },
  { id: "fallback-4", name: "Padel", slug: "padel" },
  { id: "fallback-5", name: "Fitness", slug: "fitness" },
  { id: "fallback-6", name: "Musculation", slug: "musculation" },
  { id: "fallback-7", name: "Skate", slug: "skate" },
  { id: "fallback-8", name: "Vélo", slug: "velo" },
  { id: "fallback-9", name: "Natation", slug: "natation" },
];

/** 9 étapes formulaire ; écran succès séparé (`postOnboarding`). */
const TOTAL_STEPS = 9;

const ONBOARDING_RADIUS_KM_OPTIONS = [10, 25, 50, 100] as const;
const PHOTO_BUCKET = "profile-photos";
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPT_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function uploadOnboardingPhoto(
  userId: string,
  file: File,
  kind: "portrait" | "full"
): Promise<string> {
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  console.log("[Onboarding submit] sending data:", {
    step: `upload photo ${kind}`,
    bucket: PHOTO_BUCKET,
    path,
    mimeType: file.type || `image/${ext}`,
    sizeBytes: file.size,
  });
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext}`,
  });
  if (error) {
    console.error("[Onboarding submit] error:", {
      step: `upload photo ${kind}`,
      bucket: PHOTO_BUCKET,
      path,
      message: error.message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      error,
    });
    throw error;
  }
  console.log("[Onboarding submit] result:", {
    step: `upload photo ${kind}`,
    ok: true,
    bucket: PHOTO_BUCKET,
    path,
  });
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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

type SportOptionFeatured = SportOption & { featuredKey: string };

function getFeaturedSportsFromList(all: SportOption[]): SportOptionFeatured[] {
  if (!all.length) return [];

  const bySlug = new Map<string, SportOption>();
  const byNormName = new Map<string, SportOption>();
  for (const x of all) {
    const rawSlug = x.slug != null ? String(x.slug).trim() : "";
    if (rawSlug !== "") {
      bySlug.set(rawSlug.toLowerCase(), x);
    }
    const nk = normCompact(x.name);
    if (nk !== "" && !byNormName.has(nk)) {
      byNormName.set(nk, x);
    }
  }

  const out: SportOptionFeatured[] = [];
  for (const slot of FEATURED_SPORT_SLOTS) {
    let found: SportOption | null = null;
    for (const slug of slot.matchSlugs) {
      const hit = bySlug.get(slug.toLowerCase().trim());
      if (hit) {
        found = hit;
        break;
      }
    }
    if (!found) {
      for (const compact of slot.matchNormCompacts) {
        const hit = byNormName.get(compact);
        if (hit) {
          found = hit;
          break;
        }
      }
    }
    if (!found) continue;
    out.push({
      ...found,
      name: slot.chipLabel,
      featuredKey: slot.featuredKey,
    });
  }
  return out;
}

const inputClassName =
  "w-full box-border rounded-xl border border-app-border bg-app-bg py-2.5 px-3 text-base text-app-text placeholder:text-app-muted outline-none transition-[border-color,box-shadow] focus:border-app-accent/45 focus:ring-2 focus:ring-app-accent/15";

const labelClassName = "mb-1 block text-sm font-semibold text-app-text";

export default function Onboarding() {
  const navigate = useNavigate();
  const {
    user,
    isProfileComplete,
    isLoading: authLoading,
    isAuthInitialized,
    refetchProfile,
    commitProfileRow,
    syncAuthSession,
  } = useAuth();

  const [step, setStep] = useState(1);
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
  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState("");
  const [intent, setIntent] = useState<OnboardingIntentUiValue | "">("");
  const [obLocCity, setObLocCity] = useState("");
  const [obLocRadiusKm, setObLocRadiusKm] = useState<number>(25);
  const [obLocLat, setObLocLat] = useState<number | null>(null);
  const [obLocLng, setObLocLng] = useState<number | null>(null);
  const [obLocSource, setObLocSource] = useState<"manual" | "device" | null>(null);
  const [obLocGeoLoading, setObLocGeoLoading] = useState(false);
  const [sportOptions, setSportOptions] = useState<SportOption[]>([]);
  const [selectedSportIds, setSelectedSportIds] = useState<(string | number)[]>([]);
  const [sportLevelsById, setSportLevelsById] = useState<Record<string, string>>({});
  const [sportTime, setSportTime] = useState("");
  const [sportMotivations, setSportMotivations] = useState<string[]>([]);
  const [sportIntensity, setSportIntensity] = useState<"" | "chill" | "intense">("");
  const [planningStyle, setPlanningStyle] = useState<"" | "spontaneous" | "planned">("");
  const [sportPhraseOptional, setSportPhraseOptional] = useState("");
  const [postOnboarding, setPostOnboarding] = useState(false);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [bodyFile, setBodyFile] = useState<File | null>(null);
  const [practicePreferences, setPracticePreferences] = useState<string[]>([]);
  const [confirm18, setConfirm18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingSports, setLoadingSports] = useState(true);
  const [sportsLoadError, setSportsLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionalProfileWarning, setOptionalProfileWarning] = useState<string | null>(null);
  const [hydratingDraft, setHydratingDraft] = useState(false);
  const hydratedDraftRef = useRef(false);
  

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

  const SPORTS_FETCH_TIMEOUT_MS = 10_000;

  async function saveOnboardingDraft(currentStep: number): Promise<void> {
    if (!user?.id) return;
    const userId = user.id;
    try {
      const nowIso = new Date().toISOString();
      const payload: Record<string, unknown> = {
        id: userId,
        updated_at: nowIso,
      };
      if (currentStep >= 1) {
        payload.first_name = firstName.trim() || null;
        payload.birth_date = birthDate || null;
        payload.gender = gender || null;
        payload.looking_for = interestedIn || null;
      }
      if (currentStep >= 4) {
        payload.intent = intent ? dbIntentFromUiIntent(intent) : null;
      }
      if (currentStep >= 2) {
        payload.city = obLocCity.trim() || null;
        payload.latitude = obLocLat;
        payload.longitude = obLocLng;
        payload.discovery_radius_km = obLocRadiusKm;
        payload.location_source = (obLocSource ?? (obLocCity.trim() ? "manual" : null)) as
          | "manual"
          | "device"
          | null;
        payload.location_updated_at = nowIso;
      }
      if (currentStep >= 7) {
        payload.sport_time = sportTime || null;
        payload.sport_motivation = sportMotivations.length > 0 ? sportMotivations : null;
        payload.sport_intensity = sportIntensity || null;
        payload.meet_vibe = null;
        payload.planning_style = planningStyle || null;
      }
      if (currentStep >= 8) {
        payload.sport_phrase = sportPhraseOptional.trim() || null;
      }
      if (currentStep >= 9) payload.practice_preferences = practicePreferences;
      payload.onboarding_sports_count = selectedSportIds.length;
      payload.onboarding_sports_with_level_count = selectedSportIds.filter((id) => Boolean(sportLevelsById[String(id)])).length;

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
      }

      if (currentStep >= 3) {
        const validSportIds = selectedSportIds.filter(
          (id) => typeof id === "number" || (typeof id === "string" && !String(id).startsWith("fallback-"))
        );
        const { error: delErr } = await supabase.from("profile_sports").delete().eq("profile_id", userId);
        if (delErr) {
          console.warn("[Onboarding draft] profile_sports delete failed", delErr);
          return;
        }
        if (validSportIds.length > 0) {
          const { error: insErr } = await supabase
            .from("profile_sports")
            .insert(
              validSportIds.map((sportId) => ({
                profile_id: userId,
                sport_id: sportId,
                level: sportLevelsById[String(sportId)] ?? null,
              }))
            );
          if (insErr) console.warn("[Onboarding draft] profile_sports insert failed", insErr);
        }
      }
    } catch (draftErr) {
      console.warn("[Onboarding draft] unexpected save error", draftErr);
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
          let res = await supabase
            .from("sports")
            .select("id, label, slug")
            .eq("active", true)
            .order("label", { ascending: true });
          if (res.error) {
            console.warn("[Onboarding sports] fetch with active=true failed, retry without filter:", res.error.message);
            res = await supabase
              .from("sports")
              .select("id, label, slug")
              .order("label", { ascending: true });
          }
          return res;
        })();

        const raced = await Promise.race([
          queryPromise.then((r) => ({ kind: "ok" as const, r })),
          timeoutPromise.then(() => ({ kind: "timeout" as const })),
        ]);

        if (cancelled) return;

        if (raced.kind === "timeout") {
          console.warn("[Onboarding sports] fetch result: timeout");
          setSportOptions(DEFAULT_SPORT_FALLBACK);
          setSportsLoadError(
            "Le catalogue sport met trop de temps à répondre. Suggestions locales affichées — vous pourrez actualiser après l’inscription.",
          );
          return;
        }

        const { data, error: e } = raced.r;
        console.log("[Onboarding sports] fetch result:", { ok: !e, message: e?.message ?? null });

        if (e) {
          console.error("[Onboarding sports]", e);
          setSportOptions(DEFAULT_SPORT_FALLBACK);
          setSportsLoadError(e.message || "Chargement du catalogue impossible. Suggestions locales affichées.");
          return;
        }

        const list = (data ?? []).map((r) => {
          const label = String((r.label as string | null) ?? "").trim();
          const slug = (r.slug as string | null) ?? undefined;
          return { id: r.id, name: label, slug };
        });
        const finalList = list.length > 0 ? list : DEFAULT_SPORT_FALLBACK;
        setSportOptions(finalList);
        console.log("[Onboarding sports] sports count:", finalList.length);
        if (!list.length) {
          setSportsLoadError("Aucun sport renvoyé par le serveur. Suggestions locales affichées.");
        }
      } catch (err) {
        console.error("[Onboarding sports] unexpected", err);
        setSportOptions(DEFAULT_SPORT_FALLBACK);
        setSportsLoadError("Erreur inattendue lors du chargement des sports.");
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
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    console.log("[Onboarding sports] mount");
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    console.log("[Onboarding sports] loading:", loadingSports);
    console.log("[Onboarding sports] sports count:", sportOptions.length);
    console.log("[Onboarding sports] input disabled:", false);
    console.log("[Onboarding sports] selected sports:", selectedSportIds);
    console.log("[Onboarding sports] error:", sportsLoadError ?? error ?? null);
  }, [step, loadingSports, sportOptions.length, selectedSportIds, sportsLoadError, error]);

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
        setFirstName(String(row.first_name ?? ""));
        const isoBirth = typeof row.birth_date === "string" ? row.birth_date : "";
        setBirthDate(isoBirth);
        if (isoBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [y, m, d] = isoBirth.split("-");
          setBirthInput(`${d}/${m}/${y}`);
        }
        setGender(String(row.gender ?? ""));
        setInterestedIn(String(row.looking_for ?? ""));
        setIntent(uiIntentFromDbIntent(row.intent));
        setObLocCity(String(row.city ?? ""));
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
        const si = row.sport_intensity;
        setSportIntensity(si === "chill" || si === "intense" ? si : "");
        const pl = row.planning_style;
        setPlanningStyle(pl === "spontaneous" || pl === "planned" ? pl : "");
        setPracticePreferences(Array.isArray(row.practice_preferences) ? (row.practice_preferences as string[]) : []);
        const sp = row.sport_phrase;
        setSportPhraseOptional(typeof sp === "string" ? sp : "");

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
  }, [user?.id, authLoading, isProfileComplete]);

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

  /** Profil déjà complet (retour URL / session) → Discover. Pas pendant le submit final (évite course avec l’écran succès). */
  useEffect(() => {
    if (postOnboarding) return;
    if (!isAuthInitialized || authLoading) return;
    if (!user?.id) return;
    if (loading) return;
    if (onboardingSubmitInFlightRef.current) return;
    if (isProfileComplete) {
      navigate("/discover", { replace: true });
    }
  }, [postOnboarding, isProfileComplete, authLoading, isAuthInitialized, loading, navigate, user?.id]);

  const featuredSports = useMemo(
    () => getFeaturedSportsFromList(sportOptions),
    [sportOptions]
  );

  const featuredNameBySportId = useMemo(() => {
    const m = new Map<string | number, string>();
    for (const f of featuredSports) {
      m.set(f.id, f.name);
    }
    return m;
  }, [featuredSports]);

  const searchMatches = useMemo(() => {
    const q = sportSearch.trim().toLowerCase();
    if (q.length < 3) return [];
    return sportOptions
      .filter((s) => {
        const hay = `${s.name} ${s.slug ?? ""}`.toLowerCase();
        return hay.includes(q) && !selectedSportIds.includes(s.id);
      })
      .slice(0, 10);
  }, [sportSearch, sportOptions, selectedSportIds]);

  const selectedSports = useMemo(
    () => sportOptions.filter((s) => selectedSportIds.includes(s.id)),
    [sportOptions, selectedSportIds]
  );

  const portraitPreviewUrl = useMemo(
    () => (portraitFile ? URL.createObjectURL(portraitFile) : null),
    [portraitFile]
  );
  const bodyPreviewUrl = useMemo(
    () => (bodyFile ? URL.createObjectURL(bodyFile) : null),
    [bodyFile]
  );

  useEffect(() => {
    return () => {
      if (portraitPreviewUrl) URL.revokeObjectURL(portraitPreviewUrl);
      if (bodyPreviewUrl) URL.revokeObjectURL(bodyPreviewUrl);
    };
  }, [portraitPreviewUrl, bodyPreviewUrl]);

  /** Après un submit refusé, `handleSubmit` remplit `stepHint` ; purger quand l’utilisateur corrige la dernière étape. */
  useEffect(() => {
    if (step !== TOTAL_STEPS) return;
    setStepHint(null);
  }, [step, confirm18, acceptTerms]);

  /** Doit rester avant tout `return` — sinon hooks en moins si Splash / écran succès. */
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

  if (authLoading) {
    return <SplashScreen />;
  }

  if (postOnboarding) {
    return (
      <div className="flex min-h-screen flex-col bg-app-bg font-sans">
        <GlobalHeader variant="compact" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 pt-6">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-bold leading-snug text-app-text">Ton profil est prêt.</h1>
            <p className="mt-2 text-sm leading-snug text-app-muted">
              Fais vérifier ton profil pour inspirer confiance plus vite.
            </p>
            <div
              className="mt-6 w-full rounded-2xl border border-app-border/90 bg-app-card/60 px-4 py-3 text-left"
              role="region"
              aria-label="Préférences mobilité, optionnel"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                Optionnel — mobilité
              </p>
              <p className="mt-1.5 text-sm leading-snug text-app-text">
                {ACCESSIBILITY_SECTION_INTRO}
              </p>
              <button
                type="button"
                onClick={() => navigate("/profile", { replace: true })}
                className="mt-3 text-sm font-semibold text-app-accent underline underline-offset-2"
              >
                Régler dans Mon profil
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/profile", { replace: true })}
              className="mt-8 w-full rounded-2xl py-4 text-base font-semibold shadow-sm"
              style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
            >
              Vérifier mon profil
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem("splove_verify_nudge_dismissed", "1");
                } catch {
                  /* ignore */
                }
                navigate("/discover", { replace: true });
              }}
              className="mt-3 w-full rounded-2xl border border-app-border py-3 text-sm font-semibold text-app-text"
            >
              Plus tard
            </button>
            <button
              type="button"
              onClick={() => navigate("/discover", { replace: true })}
              className="mt-4 w-full text-center text-sm font-medium text-app-muted underline underline-offset-2"
            >
              Découvrir des profils
            </button>
          </div>
        </div>
      </div>
    );
  }

  const locationReady =
    (obLocCity.trim().length >= 2 || (obLocLat != null && obLocLng != null)) &&
    [10, 25, 50, 100].includes(obLocRadiusKm);

  /** Deux photos obligatoires : portrait (visage) + corps (silhouette / en pied), formats JPG/PNG/WebP. */
  const canSubmit =
    firstName.trim() !== "" &&
    birthDate !== "" &&
    isAdultFromBirthIso(birthDate) &&
    gender !== "" &&
    interestedIn !== "" &&
    intent !== "" &&
    locationReady &&
    selectedSportIds.length >= 1 &&
    selectedSportIds.length <= 3 &&
    selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)])) &&
    (sportTime === "Matin" || sportTime === "Soir") &&
    (sportIntensity === "chill" || sportIntensity === "intense") &&
    (planningStyle === "spontaneous" || planningStyle === "planned") &&
    portraitFile != null &&
    bodyFile != null &&
    confirm18 &&
    acceptTerms;

  /** Message si le bouton final ne peut pas valider — évite un blocage silencieux (bouton désactivé sans explication). */
  function getCanSubmitBlockReason(): string | null {
    if (firstName.trim() === "") return "Indiquez votre prénom.";
    if (birthDate === "") return "Indiquez une date de naissance complète (JJ/MM/AAAA).";
    if (!isAdultFromBirthIso(birthDate)) return "Vous devez avoir au moins 18 ans.";
    if (gender === "") return "Choisissez votre genre.";
    if (interestedIn === "") return "Indiquez qui vous intéresse.";
    if (intent === "") return "Choisissez un type de rencontre.";
    if (!locationReady) {
      if (![10, 25, 50, 100].includes(obLocRadiusKm)) return "Choisis un rayon de recherche.";
      return "Indique ta ville ou utilise ta position.";
    }
    if (selectedSportIds.length < 1) return "Sélectionnez au moins 1 sport (étape sports).";
    if (selectedSportIds.length > 3) return "Maximum 3 sports.";
    if (!selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)]))) {
      return "Chaque sport doit avoir un niveau (réessaie ou repasse l’étape sports).";
    }
    if (sportTime !== "Matin" && sportTime !== "Soir") {
      return "Choisis un moment (matin ou soir) à l’étape « Ton style ».";
    }
    if (sportIntensity !== "chill" && sportIntensity !== "intense") {
      return "Choisis une intensité (chill ou intense).";
    }
    if (planningStyle !== "spontaneous" && planningStyle !== "planned") {
      return "Choisis plutôt spontané ou planifié.";
    }
    if (portraitFile == null) return "Ajoute tes deux photos (étape Montre qui tu es).";
    if (bodyFile == null) return "Ajoute tes deux photos (étape Montre qui tu es).";
    if (!confirm18) return "Coche la confirmation « 18 ans ou plus ».";
    if (!acceptTerms) return "Accepte les conditions d’utilisation et la politique de confidentialité.";
    return null;
  }

  const finalStepBlockReason =
    step === TOTAL_STEPS && !canSubmit && !loading ? getCanSubmitBlockReason() : null;

  function assignPhotoFile(
    file: File | null | undefined,
    kind: "portrait" | "body"
  ): void {
    if (!file) return;
    setStepHint(null);
    setPhotoStepError(null);
    setError(null);
    if (!PHOTO_ACCEPT_MIMES.has(file.type)) {
      setPhotoStepError("Formats acceptés : JPG, PNG ou WebP.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoStepError("Chaque photo doit faire 5 Mo maximum.");
      return;
    }
    if (kind === "portrait") setPortraitFile(file);
    else setBodyFile(file);
  }

  const toggleSport = (id: string | number) => {
    setSelectedSportIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  function handleBirthInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = birthDigitsFromRaw(e.target.value);
    setBirthInput(formatBirthDisplay(digits));
    setBirthDate(tryParseBirthIso(digits) ?? "");
  }

  function validateStep(current: number): boolean {
    setStepHint(null);
    if (current === 1) {
      if (!firstName.trim()) {
        setStepHint("Indiquez votre prénom.");
        return false;
      }
      if (!birthDate) {
        const d = birthDigitsFromRaw(birthInput);
        setStepHint(
          d.length === 8
            ? "La date de naissance n’est pas valide."
            : "Indiquez votre date de naissance (JJ/MM/AAAA)."
        );
        return false;
      }
      if (!isAdultFromBirthIso(birthDate)) {
        setStepHint("Vous devez avoir au moins 18 ans.");
        return false;
      }
      if (!gender) {
        setStepHint("Choisissez votre genre.");
        return false;
      }
      if (!interestedIn) {
        setStepHint("Indiquez qui vous intéresse.");
        return false;
      }
      return true;
    }
    if (current === 2) {
      const cityOk = obLocCity.trim().length >= 2;
      const coordsOk = obLocLat != null && obLocLng != null;
      if (!cityOk && !coordsOk) {
        setStepHint("Indique ta ville ou utilise ta position actuelle.");
        return false;
      }
      if (![10, 25, 50, 100].includes(obLocRadiusKm)) {
        setStepHint("Choisis un rayon de recherche.");
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (selectedSportIds.length < 1) {
        setStepHint("Sélectionnez au moins 1 sport.");
        return false;
      }
      if (selectedSportIds.length > 3) {
        setStepHint("Maximum 3 sports.");
        return false;
      }
      if (!selectedSportIds.every((id) => Boolean(sportLevelsById[String(id)]))) {
        setStepHint("Sélectionne à nouveau tes sports.");
        return false;
      }
      return true;
    }
    if (current === 4) {
      if (!intent) {
        setStepHint("Choisis une intention.");
        return false;
      }
      return true;
    }
    if (current === 5) {
      return true;
    }
    if (current === 6) {
      if (!portraitFile) {
        setPhotoStepError(ONBOARDING_AVATAR_REQUIRED);
        return false;
      }
      if (!bodyFile) {
        setPhotoStepError(ONBOARDING_FULLBODY_REQUIRED);
        return false;
      }
      setPhotoStepError(null);
      return true;
    }
    if (current === 7) {
      if (sportTime !== "Matin" && sportTime !== "Soir") {
        setStepHint("Choisis un moment : matin ou soir.");
        return false;
      }
      if (sportIntensity !== "chill" && sportIntensity !== "intense") {
        setStepHint("Choisis une intensité : chill ou intense.");
        return false;
      }
      if (planningStyle !== "spontaneous" && planningStyle !== "planned") {
        setStepHint("Choisis spontané ou planifié.");
        return false;
      }
      return true;
    }
    if (current === 8) {
      return true;
    }
    if (current === 9) {
      if (!confirm18) {
        setStepHint("Coche « J’ai 18 ans ou plus ».");
        return false;
      }
      if (!acceptTerms) {
        setStepHint("Accepte les conditions et la politique de confidentialité.");
        return false;
      }
      return true;
    }
    return true;
  }

  async function goNext() {
    if (authLoading || !user?.id) {
      console.warn("[Onboarding] next step blocked", {
        reason: authLoading ? "authLoading" : "no user",
      });
      return;
    }
    if (!validateStep(step)) return;
    if (step === 2 && obLocSource === null && obLocCity.trim().length >= 2) {
      setObLocSource("manual");
    }
    setError(null);
    setOptionalProfileWarning(null);
    if (step !== 6) setPhotoStepError(null);
    setModerationSuccessNote(null);
    await saveOnboardingDraft(step);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  async function handleObUseDeviceLocation() {
    setStepHint(null);
    setObLocGeoLoading(true);
    try {
      const c = await getCurrentPositionCoords();
      if (!c) {
        setStepHint("Position indisponible. Tu peux saisir ta ville manuellement.");
        return;
      }
      const city = await reverseGeocodeCity(c.lat, c.lng);
      setObLocLat(c.lat);
      setObLocLng(c.lng);
      setObLocSource("device");
      if (city) {
        setObLocCity(city);
      } else if (!obLocCity.trim()) {
        setObLocCity("Ta zone");
      }
    } finally {
      setObLocGeoLoading(false);
    }
  }

  function goBack() {
    setStepHint(null);
    setPhotoStepError(null);
    setModerationSuccessNote(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (authLoading) {
      console.warn("[Onboarding] final submit blocked: authLoading");
      return;
    }
    
    const stillAuthenticated = await syncAuthSession();
    console.log("[Onboarding] syncAuthSession", stillAuthenticated);
    
    const {
      data: { user: freshUser },
      error: getUserError,
    } = await supabase.auth.getUser();
    
    console.log("[Onboarding] getUser", { freshUser, getUserError });
    
    const authUser = freshUser ?? user;
    
    if (getUserError || !authUser?.id) {
      console.warn("[Onboarding] final submit: no authenticated user after refresh", getUserError);
      alert("Session expirée ou introuvable. Reconnecte-toi.");
      navigate("/auth", { replace: true });
      return;
    }
    console.log("[Onboarding] final submit start");
    if (!canSubmit) {
      const hint = getCanSubmitBlockReason() ?? "Complétez les champs obligatoires pour continuer.";
      setStepHint(hint);
      console.error("[Onboarding submit] blocked: canSubmit false", { reason: hint });
      return;
    }
    for (let s = 1; s <= 9; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    if (!portraitFile || !bodyFile) {
      setPhotoStepError(
        !portraitFile ? ONBOARDING_AVATAR_REQUIRED : ONBOARDING_FULLBODY_REQUIRED
      );
      setStep(6);
      return;
    }

    setError(null);
    setStepHint(null);
    setPhotoStepError(null);
    setLoading(true);

    if (!isAdultFromBirthIso(birthDate)) {
      setLoading(false);
      setError("SPLove est réservé aux personnes de 18 ans ou plus.");
      console.error("[Onboarding submit] blocked: under minimum age");
      return;
    }

    const authUserId = authUser.id;

    onboardingSubmitInFlightRef.current = true;
    try {
      console.log("[Onboarding submit] start", {
        userId: authUserId,
        selectedSportsCount: selectedSportIds.length,
      });

      let portraitUrl: string;
      let fullbodyUrl: string;
      try {
        console.log("[Onboarding submit] start: upload photo portrait");
        portraitUrl = await uploadOnboardingPhoto(authUserId, portraitFile, "portrait");
        console.log("[Onboarding submit] result: upload photo portrait", { portraitUrl });
        console.log("[Onboarding submit] start: upload photo fullbody");
        fullbodyUrl = await uploadOnboardingPhoto(authUserId, bodyFile, "full");
        console.log("[Onboarding submit] result: upload photo fullbody", { fullbodyUrl });
      } catch (uploadErr) {
        logDetailedError("upload photos", uploadErr);
        setError(
          uploadErr instanceof Error
            ? "Impossible d’envoyer les photos. Réessayez."
            : "Impossible d’envoyer les photos. Réessayez."
        );
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
          setError("Impossible de préparer la vérification des photos. Réessaie.");
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
          setError("Vérification photo indisponible.");
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
          setError("Vérification photo indisponible.");
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

      const moderationAllowsComplete = PHOTO_VERIFICATION_PLACEHOLDER || !moderationRejected;

      let moderationBanner: string | null = null;
      if (!PHOTO_VERIFICATION_PLACEHOLDER && moderationAllowsComplete) {
        moderationBanner =
          slot1Status === "pending_review" || slot2Status === "pending_review"
            ? "Ta photo est en cours de vérification. Tu peux continuer ; ta fiche Discover s’affichera une fois les photos validées par l’équipe."
            : "Photo validée.";
      }
      setModerationSuccessNote(moderationBanner);

      const completionFromData = isOnboardingComplete({
        first_name: firstName.trim(),
        birth_date: birthDate,
        gender,
        looking_for: interestedIn,
        intent: dbIntentFromUiIntent(intent),
        city: obLocCity.trim() || null,
        latitude: obLocLat,
        longitude: obLocLng,
        discovery_radius_km: obLocRadiusKm,
        portrait_url: portraitUrl,
        fullbody_url: fullbodyUrl,
        sport_time: sportTime,
        sport_intensity: sportIntensity,
        planning_style: planningStyle,
        onboarding_sports_count: selectedSportIds.length,
        onboarding_sports_with_level_count: selectedSportIds.filter((id) => Boolean(sportLevelsById[String(id)])).length,
      });
      const completionFlag = moderationAllowsComplete && completionFromData;

      const profilePayload: Record<string, unknown> = {
        id: authUserId,
        first_name: firstName.trim(),
        birth_date: birthDate,
        gender,
        looking_for: interestedIn,
        intent: dbIntentFromUiIntent(intent),
        city: obLocCity.trim() || null,
        latitude: obLocLat,
        longitude: obLocLng,
        discovery_radius_km: obLocRadiusKm,
        location_source: locSourceResolved,
        location_updated_at: new Date().toISOString(),
        sport_time: sportTime || null,
        sport_intensity: sportIntensity || null,
        meet_vibe: null,
        planning_style: planningStyle || null,
        sport_motivation: sportMotivations.length > 0 ? sportMotivations : null,
        sport_phrase: sportPhraseOptional.trim() ? sportPhraseOptional.trim().slice(0, 500) : null,
        practice_preferences: practicePreferences,
        onboarding_sports_count: selectedSportIds.length,
        onboarding_sports_with_level_count: selectedSportIds.filter((id) => Boolean(sportLevelsById[String(id)])).length,
        portrait_url: portraitUrl,
        fullbody_url: fullbodyUrl,
        main_photo_url: portraitUrl || fullbodyUrl,
        profile_completed: completionFlag,
        onboarding_completed: completionFlag,
        updated_at: new Date().toISOString(),
      };

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
        setStep(6);
        const failPayload: Record<string, unknown> = {
          ...profilePayload,
          profile_completed: false,
          onboarding_completed: false,
        };
        let { error: bailErr } = await supabase
          .from("profiles")
          .upsert({ ...failPayload, id: authUser.id }, { onConflict: "id" });
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
              .upsert({ ...failPayloadFallback, id: authUser.id }, { onConflict: "id" }));
          }
        }
        if (bailErr) {
          logDetailedError("profiles upsert after photo rejection", bailErr, {
            payload: failPayload,
          });
          setError("Erreur lors de l’enregistrement du profil.");
        }
        setLoading(false);
        return;
      }

      const prodSanitizeCtx: ProdPayloadSanitizeContext = {
        interestedIn,
        sportTime,
        practicePreferences,
        portraitUrl: portraitUrl,
        fullbodyUrl: fullbodyUrl,
      };

      /** Payload prod : même base que le métier ; retries retirent colonnes / mappent legacy. */
      let payloadForUpsert: Record<string, unknown> = { ...profilePayload };
      let profileUpsertSelect = PROFILE_UPSERT_ONBOARDING_SELECT;
      let profileError: { message?: string; code?: string | number } | null = null;
      let upsertRow: unknown = null;
      let aggressivePhase = 0;

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
              id: authUser.id,
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
              id: authUser.id,
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
            setOptionalProfileWarning(OPTIONAL_PROFILE_WARNING_MESSAGE);
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
          console.error("[Onboarding submit] verdict: upsert/select KO", {
            outcome: "upsert KO OR select KO",
            select: profileUpsertSelect,
            faultyColumn: extractFaultyColumnNameFromPostgrestMessage(profileError.message),
          });
          setError(
            /18 ans|réservé aux personnes/i.test(profileError.message || "")
              ? "SPLove est réservé aux personnes de 18 ans ou plus."
              : "Erreur lors de l’enregistrement du profil."
          );
        } else {
          setError("Réponse serveur incomplète après enregistrement du profil. Réessayez.");
        }
        return;
      }

      if (!isProfileRecord(upsertRow)) {
        console.error("[Onboarding submit] upsert: réponse inattendue (pas un objet profil)", upsertRow);
        setError("Réponse serveur incomplète après enregistrement du profil. Réessayez.");
        return;
      }

      

      const validSportIds = selectedSportIds.filter(
        (id) =>
          typeof id === "number" || (typeof id === "string" && !String(id).startsWith("fallback-"))
      );

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
          logDetailedError("profile_sports delete", deleteSportsErr, { profile_id: authUserId });
          setError("Impossible d’enregistrer vos sports pour le moment.");
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
          logDetailedError("profile_sports insert", sportsError, { rows });
          setError("Impossible d’enregistrer vos sports pour le moment.");
          return;
        }
      }

      console.log("[Onboarding submit] start: refetchProfile");
      await refetchProfile();
      console.log("[Onboarding submit] result: refetchProfile done");

      const gateOk = Boolean(upsertRow.profile_completed) || completionFlag;
      if (!gateOk) {
        console.error("[Onboarding submit] verdict: upsert OK + select OK but gating KO");
        console.error("[Onboarding submit] gating incomplet après upsert", {
          profile_completed: upsertRow.profile_completed,
          birth_date: upsertRow.birth_date,
        });
        setError(
          "Le profil n’a pas pu être validé côté application. Réessayez ou rafraîchissez la page.",
        );
        return;
      }

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

      commitProfileRow(upsertRow);

      if (moderationBanner) {
        await new Promise((r) => window.setTimeout(r, 1400));
      }
      console.log("[Onboarding submit] success → momentum screen");
      setPostOnboarding(true);
    } catch (err) {
      logDetailedError("handleSubmit catch", err);
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      onboardingSubmitInFlightRef.current = false;
      console.log("[Onboarding submit] end");
      setLoading(false);
    }
  }

  const intentChoiceClass = (active: boolean) =>
    `rounded-xl border-2 py-3 px-2 text-sm font-semibold transition-all sm:text-base ${
      active
        ? "shadow-sm ring-2 ring-offset-1"
        : "border-app-border bg-app-card text-app-text hover:border-app-border"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-app-bg font-sans">
      <GlobalHeader variant="compact" />
      <div className="flex flex-1 flex-col items-center px-4 pb-4 pt-1">
        <div className="flex w-full max-w-md flex-1 flex-col overflow-hidden rounded-2xl bg-app-card shadow-sm ring-1 ring-app-border sm:my-1 sm:max-h-[min(680px,calc(100vh-88px))]">
          <div className="shrink-0 border-b border-app-border px-3 pb-2 pt-2.5 sm:px-4 sm:pt-3">
            <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-app-muted">
              Étape {step} / {TOTAL_STEPS}
            </p>
            <div className="mx-auto mt-1.5 flex max-w-[220px] justify-center gap-1 px-1">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span
                  key={i}
                  className="h-0.5 min-w-0 flex-1 rounded-full"
                  style={{ background: i < step ? BRAND_BG : APP_BORDER }}
                />
              ))}
            </div>

            <div className="mt-2.5 flex flex-col items-center">
              <div className="flex max-w-full items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-app-bg ring-1 ring-app-border">
                  <img
                    src="/logo.png"
                    alt="SPLove"
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
              {step === 1 ? (
                <p className="mt-1 max-w-[280px] text-center text-xs leading-snug text-app-muted sm:text-sm">
                  Le sport comme point de départ. Le reste vient en vrai.
                </p>
              ) : (
                <p className="mt-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-app-muted">
                  Profil
                </p>
              )}
            </div>

            <h1 className="mt-2.5 text-center text-base font-bold leading-snug text-app-text sm:text-lg">
              {step === 1 && "Parlons de toi"}
              {step === 2 && "Où veux-tu rencontrer du monde ?"}
              {step === 3 && "Quels sports te font vibrer ?"}
              {step === 4 && "Tu es là pour quoi ?"}
              {step === 5 && "Sur SPLove, les femmes font le premier pas."}
              {step === 6 && "Montre qui tu es"}
              {step === 7 && "Ton style"}
              {step === 8 && "Ajoute une touche perso"}
              {step === 9 && "Derniers détails"}
            </h1>
            <p className="mt-0.5 text-center text-xs leading-snug text-app-muted sm:text-sm">
              {step === 1 && "Prénom, date de naissance, genre et qui t’intéresse."}
              {step === 2 && "On te montre des profils autour de ta zone, sans afficher ton adresse exacte."}
              {step === 3 && "Choisis jusqu’à 3 sports"}
              {step === 4 && "Un choix, c’est tout."}
              {step === 5 &&
                "Dans les matchs amoureux femme-homme, c’est la femme qui envoie le premier message. Pour les autres matchs, la personne qui valide le match peut écrire."}
              {step === 6 && "2 photos suffisent pour commencer"}
              {step === 7 && "Trois réglages rapides."}
              {step === 8 && "Optionnel"}
              {step === 9 && "Dernière ligne droite."}
            </p>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={step === TOTAL_STEPS ? handleSubmit : (e) => e.preventDefault()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 sm:px-4 sm:py-3">
              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <label className={labelClassName} htmlFor="ob-first">
                      Prénom *
                    </label>
                    <input
                      id="ob-first"
                      type="text"
                      placeholder="Votre prénom"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ob-birth">
                      Date de naissance *
                    </label>
                    <input
                      id="ob-birth"
                      type="text"
                      inputMode="numeric"
                      autoComplete="bday"
                      placeholder="JJ/MM/AAAA"
                      maxLength={10}
                      value={birthInput}
                      onChange={handleBirthInputChange}
                      className={inputClassName}
                    />
                    {birthDigitsFromRaw(birthInput).length === 8 && !birthDate && (
                      <p className="mt-1 text-xs text-red-600">
                        Date invalide — vérifiez jour, mois et année ({BIRTH_YEAR_MIN}–{new Date().getFullYear()}).
                      </p>
                    )}
                    {birthDate && !isAdultFromBirthIso(birthDate) && (
                      <p className="mt-1 text-xs text-red-600">Vous devez avoir au moins 18 ans.</p>
                    )}
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ob-gender">
                      Genre *
                    </label>
                    <select
                      id="ob-gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Choisir</option>
                      {GENDER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ob-look">
                      Intéressé(e) par *
                    </label>
                    <select
                      id="ob-look"
                      value={interestedIn}
                      onChange={(e) => setInterestedIn(e.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Choisir</option>
                      {INTERESTED_IN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClassName} htmlFor="ob-loc-city">
                      Ville
                    </label>
                    <input
                      id="ob-loc-city"
                      type="text"
                      placeholder="Ex. Marseille"
                      value={obLocCity}
                      onChange={(e) => {
                        setObLocCity(e.target.value);
                        setObLocSource(null);
                      }}
                      autoComplete="address-level2"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="ob-loc-radius">
                      Rayon
                    </label>
                    <select
                      id="ob-loc-radius"
                      value={obLocRadiusKm}
                      onChange={(e) => setObLocRadiusKm(Number(e.target.value))}
                      className={inputClassName}
                    >
                      {ONBOARDING_RADIUS_KM_OPTIONS.map((km) => (
                        <option key={km} value={km}>
                          {km} km
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
                    {obLocGeoLoading ? "Localisation…" : "Utiliser ma position actuelle"}
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-2.5">
                  <p className="text-xs text-app-muted">Jusqu’à 3 sports · recherche ci-dessous</p>

                  {sportsLoadError ? (
                    <p className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950">
                      {sportsLoadError}
                    </p>
                  ) : null}

                  {selectedSports.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSports.map((s) => (
                        <button
                          key={String(s.id)}
                          type="button"
                          onClick={() => toggleSport(s.id)}
                          className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                          style={{
                            borderColor: BRAND_BG,
                            background: BRAND_BG,
                            color: TEXT_ON_BRAND,
                          }}
                        >
                          {featuredNameBySportId.get(s.id) ?? s.name} ×
                        </button>
                      ))}
                    </div>
                  )}
                  {featuredSports.length > 0 && (
                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-app-muted">
                        Suggestions{loadingSports ? " (aperçu)" : ""}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {featuredSports.map((sport) => {
                          const isSelected = selectedSportIds.includes(sport.id);
                          const isDisabled = !isSelected && selectedSportIds.length >= 3;
                          return (
                            <button
                              key={sport.featuredKey}
                              type="button"
                              onClick={() => toggleSport(sport.id)}
                              disabled={isDisabled}
                              className="rounded-xl border-2 py-2 px-3 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                              style={{
                                borderColor: isSelected ? BRAND_BG : APP_BORDER,
                                background: isSelected ? BRAND_BG : APP_CARD,
                                color: isSelected ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                              }}
                            >
                              {sport.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={labelClassName} htmlFor="ob-sport-search">
                      Rechercher un sport
                    </label>
                    <input
                      id="ob-sport-search"
                      type="search"
                      autoComplete="off"
                      placeholder="Rechercher un sport"
                      value={sportSearch}
                      onChange={(e) => setSportSearch(e.target.value)}
                      className={inputClassName}
                    />
                    {sportSearch.trim().length > 0 && sportSearch.trim().length < 3 && (
                      <p className="mt-1 text-xs text-app-muted">Encore {3 - sportSearch.trim().length} lettre(s).</p>
                    )}
                    {searchMatches.length > 0 && (
                      <ul
                        className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-app-border bg-app-card text-sm shadow-sm"
                        role="listbox"
                      >
                        {searchMatches.map((s) => (
                          <li key={String(s.id)}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-app-border"
                              onClick={() => {
                                toggleSport(s.id);
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
                    <p className="text-sm text-app-muted">Chargement du catalogue sport…</p>
                  ) : null}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5">
                    {ONBOARDING_INTENT_CARDS.map((card) => {
                      const active = intent === card.uiValue;
                      return (
                        <button
                          key={card.uiValue}
                          type="button"
                          onClick={() => setIntent(card.uiValue)}
                          className={`${intentChoiceClass(active)} min-h-[52px] w-full`}
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
                            <span className="text-base font-semibold">{card.title}</span>
                            <span className="text-lg">{active ? "✓" : ""}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 5 && <div className="min-h-[48px]" aria-hidden />}

              {step === 6 && (
                <div className="space-y-4">
                  {photoStepError && (
                    <p className="rounded-lg border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700" role="alert">
                      {photoStepError}
                    </p>
                  )}

                  <div className="space-y-3">
                    <div>
                      <span className={labelClassName}>Photo visage</span>
                      <p className="mb-1.5 text-[11px] text-app-muted">Visage clair, seul(e)</p>
                      <input
                        ref={portraitInputRef}
                        id="ob-photo-portrait"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          assignPhotoFile(e.target.files?.[0], "portrait");
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="ob-photo-portrait"
                        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-dashed border-app-border bg-app-bg/80 text-center transition hover:border-app-border"
                      >
                        {portraitPreviewUrl ? (
                          <img
                            src={portraitPreviewUrl}
                            alt="Aperçu photo visage"
                            className="aspect-[3/4] w-full max-w-[280px] mx-auto object-cover"
                          />
                        ) : (
                          <span className="flex aspect-[3/4] w-full max-w-[280px] mx-auto flex-col items-center justify-center gap-1 px-2 py-6">
                            <span className="text-xs font-semibold text-app-text">Ajouter</span>
                            <span className="text-[10px] text-app-muted">JPG, PNG, WebP · max 5 Mo</span>
                          </span>
                        )}
                      </label>
                      {portraitPreviewUrl ? (
                        <button
                          type="button"
                          onClick={() => portraitInputRef.current?.click()}
                          className="mt-2 w-full max-w-[280px] mx-auto rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                        >
                          Remplacer
                        </button>
                      ) : null}
                    </div>

                    <div>
                      <span className={labelClassName}>Photo activité</span>
                      <p className="mb-1.5 text-[11px] text-app-muted">En mouvement ou en pied</p>
                      <input
                        ref={bodyInputRef}
                        id="ob-photo-body"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          assignPhotoFile(e.target.files?.[0], "body");
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="ob-photo-body"
                        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-dashed border-app-border bg-app-bg/80 text-center transition hover:border-app-border"
                      >
                        {bodyPreviewUrl ? (
                          <img
                            src={bodyPreviewUrl}
                            alt="Aperçu photo activité"
                            className="aspect-[3/4] w-full max-w-[280px] mx-auto object-cover"
                          />
                        ) : (
                          <span className="flex aspect-[3/4] w-full max-w-[280px] mx-auto flex-col items-center justify-center gap-1 px-2 py-6">
                            <span className="text-xs font-semibold text-app-text">Ajouter</span>
                            <span className="text-[10px] text-app-muted">JPG, PNG, WebP · max 5 Mo</span>
                          </span>
                        )}
                      </label>
                      {bodyPreviewUrl ? (
                        <button
                          type="button"
                          onClick={() => bodyInputRef.current?.click()}
                          className="mt-2 w-full max-w-[280px] mx-auto rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                        >
                          Remplacer
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-5">
                  <div>
                    <span className={labelClassName}>Tu préfères</span>
                    <div className="mt-2 flex gap-2">
                      {ONBOARDING_TIME_QUICK_OPTIONS.map((o) => {
                        const active = sportTime === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setSportTime(o.value)}
                            className="min-h-[48px] flex-1 rounded-xl border-2 px-3 text-sm font-semibold transition-all sm:text-base"
                            style={{
                              borderColor: active ? BRAND_BG : APP_BORDER,
                              background: active ? BRAND_BG : APP_CARD,
                              color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                            }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className={labelClassName}>Ton rythme</span>
                    <div className="mt-2 flex gap-2">
                      {ONBOARDING_INTENSITY_QUICK_OPTIONS.map((o) => {
                        const active = sportIntensity === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setSportIntensity(o.value)}
                            className="min-h-[48px] flex-1 rounded-xl border-2 px-3 text-sm font-semibold transition-all sm:text-base"
                            style={{
                              borderColor: active ? BRAND_BG : APP_BORDER,
                              background: active ? BRAND_BG : APP_CARD,
                              color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                            }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className={labelClassName}>Organisation</span>
                    <div className="mt-2 flex flex-col gap-2">
                      {ORGANIZATION_OPTIONS.map((o) => {
                        const active = planningStyle === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setPlanningStyle(o.value)}
                            className={`${intentChoiceClass(active)} min-h-[48px] w-full text-center`}
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
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 8 && (
                <div className="space-y-3">
                  <label className={labelClassName} htmlFor="ob-sport-phrase">
                    Ta phrase (optionnel)
                  </label>
                  <textarea
                    id="ob-sport-phrase"
                    rows={4}
                    value={sportPhraseOptional}
                    onChange={(e) => setSportPhraseOptional(e.target.value)}
                    placeholder="Ex : Toujours partant(e) pour une session skate au coucher du soleil."
                    className={`${inputClassName} min-h-[100px] resize-y`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void goNext()}
                    className="text-sm font-medium text-app-muted underline underline-offset-2"
                  >
                    Passer
                  </button>
                </div>
              )}

              {step === 9 && (
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-app-border bg-app-bg/60 px-3 py-3 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={confirm18}
                      onChange={(e) => setConfirm18(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-app-border"
                    />
                    <span>J’ai 18 ans ou plus</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-app-border bg-app-bg/60 px-3 py-3 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-app-border"
                    />
                    <span>J’accepte les conditions d’utilisation et la politique de confidentialité</span>
                  </label>
                </div>
              )}

              {stepHint && step !== 6 && (
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

            <div className="shrink-0 border-t border-app-border bg-app-card px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex gap-2">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex-1 rounded-xl border border-app-border py-3 text-sm font-semibold text-app-text hover:bg-app-border"
                  >
                    Retour
                  </button>
                ) : (
                  <span className="flex-1" aria-hidden />
                )}
                {step < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={() => void goNext()}
                    disabled={authLoading}
                    className="flex-1 rounded-xl py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
                  >
                    {step === 2
                      ? "Enregistrer ma localisation"
                      : step === 3
                        ? "Continuer"
                        : step === 5
                          ? "J’ai compris"
                          : step === 8
                            ? "Continuer"
                            : "Suivant"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading || authLoading || hydratingDraft}
                    className="flex-1 rounded-xl py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
                    style={{
                      background: !loading && !authLoading && user?.id ? BRAND_BG : CTA_DISABLED_BG,
                      color: TEXT_ON_BRAND,
                    }}
                  >
                    {loading ? "Chargement…" : "Accéder à SPLove"}
                  </button>
                )}
              </div>
              {hydratingDraft ? (
                <p className="mt-2 text-xs text-app-muted" aria-live="polite">
                  Restauration de votre progression…
                </p>
              ) : null}
              {env.appEnv !== "production" && env.veriffPublicKey ? (
                <p className="mt-2 text-xs text-app-muted">
                  Vérification Veriff prête (non bloquante) : activable après onboarding.
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
