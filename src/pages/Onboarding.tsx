import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { GlobalHeader } from "../components/GlobalHeader";
import {
  ACCESSIBILITY_PREF_ADAPTED_LABEL,
  ACCESSIBILITY_PREF_BOTH_REQUIRED,
  ACCESSIBILITY_PREF_STANDARD_LABEL,
  ACCESSIBILITY_SECTION_INTRO,
  ACCESSIBILITY_SELF_LABEL,
  ONBOARDING_AVATAR_REQUIRED,
  ONBOARDING_FULLBODY_REQUIRED,
  ONBOARDING_PHOTO_COMPLIANCE_LABEL,
  SAFETY_CONTENT_REFUSAL,
} from "../constants/copy";
import { bioPublicTextViolatesPolicy } from "../lib/contentModeration";
import { isAdultFromBirthIso } from "../lib/ageGate";
import {
  PROFILE_UPSERT_ONBOARDING_SELECT,
  PROFILE_UPSERT_ONBOARDING_SELECT_CORE,
  isUndefinedColumnError,
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

const SPORT_TIME_OPTIONS = [
  { value: "Matin", label: "Matin" },
  { value: "Midi", label: "Midi" },
  { value: "Soir", label: "Soir" },
  { value: "Week-end", label: "Week-end" },
] as const;

const SPORT_MOTIVATION_OPTIONS = [
  "Se dépasser",
  "La nature",
  "Le fun",
  "La compétition",
  "Rencontrer des gens",
  "Se vider la tête",
  "La performance",
] as const;

const SPORT_PHRASE_MAX_LENGTH = 120;

/** Valeurs BDD : UI « Amour » → Amoureux */
const INTENT_DB_AMOUR = "Amoureux";
const INTENT_DB_AMICAL = "Amical";

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

const TOTAL_STEPS = 8;

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
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext}`,
  });
  if (error) throw error;
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
    refetchProfile,
    commitProfileRow,
    syncAuthSession,
  } = useAuth();

  const [step, setStep] = useState(1);
  const [sportSearch, setSportSearch] = useState("");
  const [stepHint, setStepHint] = useState<string | null>(null);
  const [sportPhraseContactError, setSportPhraseContactError] = useState<string | null>(null);
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
  const [intent, setIntent] = useState("");
  const [obLocCity, setObLocCity] = useState("");
  const [obLocRadiusKm, setObLocRadiusKm] = useState<number>(25);
  const [obLocLat, setObLocLat] = useState<number | null>(null);
  const [obLocLng, setObLocLng] = useState<number | null>(null);
  const [obLocSource, setObLocSource] = useState<"manual" | "device" | null>(null);
  const [obLocGeoLoading, setObLocGeoLoading] = useState(false);
  const [sportOptions, setSportOptions] = useState<SportOption[]>([]);
  const [selectedSportIds, setSelectedSportIds] = useState<(string | number)[]>([]);
  const [sportTime, setSportTime] = useState("");
  const [sportMotivations, setSportMotivations] = useState<string[]>([]);
  const [sportPhrase, setSportPhrase] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [bodyFile, setBodyFile] = useState<File | null>(null);
  const [photoComplianceConfirmed, setPhotoComplianceConfirmed] = useState(false);
  const [needsAdaptedActivities, setNeedsAdaptedActivities] = useState(false);
  const [prefOpenToStandardActivity, setPrefOpenToStandardActivity] = useState(true);
  const [prefOpenToAdaptedActivity, setPrefOpenToAdaptedActivity] = useState(true);
  const [confirm18, setConfirm18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingSports, setLoadingSports] = useState(true);
  const [sportsLoadError, setSportsLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const SPORTS_FETCH_TIMEOUT_MS = 10_000;

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
    console.log("[Onboarding] authLoading / user", {
      authLoading,
      userId: user?.id ?? null,
    });
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.id) return;
    if (onboardingSubmitInFlightRef.current) return;
    console.log("[Onboarding] redirect to auth (resolved auth, no user)");
    navigate("/auth", { replace: true });
  }, [user?.id, authLoading, navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) return;
    if (isProfileComplete) {
      navigate("/discover", { replace: true });
    }
  }, [isProfileComplete, authLoading, navigate, user?.id]);

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

  /** Après un submit refusé, `handleSubmit` remplit `stepHint` ; il faut le purger quand l’utilisateur corrige l’étape 7 (sinon message obsolète alors que `finalStepBlockReason` est déjà à jour). */
  useEffect(() => {
    if (step !== TOTAL_STEPS) return;
    setStepHint(null);
  }, [
    step,
    confirm18,
    acceptTerms,
    photoComplianceConfirmed,
    prefOpenToStandardActivity,
    prefOpenToAdaptedActivity,
  ]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-app-bg font-sans">
        <GlobalHeader variant="compact" />
        <div className="flex flex-1 items-center justify-center px-4">
          <span className="text-sm text-app-muted">Chargement…</span>
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
    portraitFile != null &&
    bodyFile != null &&
    (prefOpenToStandardActivity || prefOpenToAdaptedActivity) &&
    photoComplianceConfirmed &&
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
    if (portraitFile == null) return "Ajoutez une photo portrait (étape 5).";
    if (bodyFile == null) return "Ajoutez une photo en pied (étape 6).";
    if (!prefOpenToStandardActivity && !prefOpenToAdaptedActivity) {
      return ACCESSIBILITY_PREF_BOTH_REQUIRED;
    }
    if (!confirm18) return "Cochez la confirmation « 18 ans ou plus ».";
    if (!acceptTerms) return "Acceptez les conditions d’utilisation et la politique de confidentialité.";
    if (!photoComplianceConfirmed) {
      return "Confirmez le respect des consignes photos (étape 6) pour continuer.";
    }
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
    setPhotoComplianceConfirmed(false);
    setStepHint("Votre photo principale doit montrer clairement votre visage.");
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

  const toggleMotivation = (option: string) => {
    setSportMotivations((prev) =>
      prev.includes(option) ? prev.filter((m) => m !== option) : [...prev, option]
    );
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
      if (!intent) {
        setStepHint("Choisissez un type de rencontre.");
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
      return true;
    }
    if (current === 5) {
      const t = sportPhrase.trim();
      if (t.length > 0 && bioPublicTextViolatesPolicy(sportPhrase)) {
        setSportPhraseContactError(SAFETY_CONTENT_REFUSAL);
        return false;
      }
      setSportPhraseContactError(null);
      return true;
    }
    if (current === 6) {
      if (!portraitFile) {
        setPhotoStepError(ONBOARDING_AVATAR_REQUIRED);
        return false;
      }
      setPhotoStepError(null);
      return true;
    }
    if (current === 7) {
      if (!bodyFile) {
        setPhotoStepError(ONBOARDING_FULLBODY_REQUIRED);
        return false;
      }
      if (!photoComplianceConfirmed) {
        setPhotoStepError("Confirme que tes photos respectent les consignes (visage, silhouette, pas d’objets ni captures) pour continuer.");
        return false;
      }
      setPhotoStepError(null);
      return true;
    }
    if (current === 8) {
      if (!prefOpenToStandardActivity && !prefOpenToAdaptedActivity) {
        setStepHint(ACCESSIBILITY_PREF_BOTH_REQUIRED);
        return false;
      }
      return true;
    }
    return true;
  }

  function goNext() {
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
    if (step !== 6 && step !== 7) setPhotoStepError(null);
    setModerationSuccessNote(null);
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
    setSportPhraseContactError(null);
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
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    if (!validateStep(3)) {
      setStep(3);
      return;
    }

    const trimmedPhrase = sportPhrase.trim();
    if (
      trimmedPhrase.length > 0 &&
      bioPublicTextViolatesPolicy(sportPhrase)
    ) {
      setSportPhraseContactError(SAFETY_CONTENT_REFUSAL);
      setStep(4);
      return;
    }
    if (!validateStep(5)) {
      setStep(5);
      return;
    }
    if (!validateStep(6)) {
      setStep(6);
      return;
    }
    if (!validateStep(7)) {
      setStep(7);
      return;
    }
    if (!validateStep(8)) {
      setStep(8);
      return;
    }
    if (!portraitFile || !bodyFile) {
      setPhotoStepError(
        !portraitFile ? ONBOARDING_AVATAR_REQUIRED : ONBOARDING_FULLBODY_REQUIRED
      );
      setStep(!portraitFile ? 6 : 7);
      return;
    }

    setError(null);
    setStepHint(null);
    setSportPhraseContactError(null);
    setPhotoStepError(null);
    setLoading(true);

    if (!isAdultFromBirthIso(birthDate)) {
      setLoading(false);
      setError("SPLove est réservé aux personnes de 18 ans ou plus.");
      console.error("[Onboarding submit] blocked: under minimum age");
      return;
    }

    const phraseFinal =
      trimmedPhrase.length > 0
        ? trimmedPhrase.slice(0, SPORT_PHRASE_MAX_LENGTH)
        : null;
        const authUserId = authUser.id;

    onboardingSubmitInFlightRef.current = true;
    try {
      console.log("[Onboarding submit] start");

      let portraitUrl: string;
      let fullbodyUrl: string;
      try {
        portraitUrl = await uploadOnboardingPhoto(authUserId, portraitFile, "portrait");
        fullbodyUrl = await uploadOnboardingPhoto(authUserId, bodyFile, "full");
      } catch (uploadErr) {
        console.error("[Onboarding submit] error:", uploadErr);
        setError(
          uploadErr instanceof Error
            ? uploadErr.message
            : "Impossible d’envoyer les photos. Réessayez."
        );
        return;
      }

      let slot1Status: PhotoModerationStatus = "approved";
      let slot2Status: PhotoModerationStatus = "approved";
      let moderationRejected = false;
      let moderationUiReason: string | null = null;
      let modPrimarySlot: 1 | 2 = 1;

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
          setError(m1.error?.message ?? "Vérification photo indisponible.");
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
          setError(m2.error?.message ?? "Vérification photo indisponible.");
          return;
        }
        slot2Status = m2.data.status;
        moderationRejected = slot1Status === "rejected" || slot2Status === "rejected";
        if (moderationRejected) {
          moderationUiReason =
            slot1Status === "rejected"
              ? (m1.data.ui_reason_code ?? null)
              : (m2.data.ui_reason_code ?? null);
          modPrimarySlot = slot1Status === "rejected" ? 1 : 2;
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

      const profilePayload: Record<string, unknown> = {
        id: authUserId,
        first_name: firstName.trim(),
        birth_date: birthDate,
        gender,
        looking_for: interestedIn,
        intent,
        city: obLocCity.trim() || null,
        latitude: obLocLat,
        longitude: obLocLng,
        discovery_radius_km: obLocRadiusKm,
        location_source: locSourceResolved,
        location_updated_at: new Date().toISOString(),
        sport_time: sportTime || null,
        sport_motivation: sportMotivations.length > 0 ? sportMotivations : null,
        sport_phrase: phraseFinal,
        needs_adapted_activities: needsAdaptedActivities,
        portrait_url: portraitUrl,
        fullbody_url: fullbodyUrl,
        main_photo_url: portraitUrl || fullbodyUrl,
        profile_completed: moderationAllowsComplete,
        onboarding_completed: moderationAllowsComplete,
        onboarding_done: moderationAllowsComplete,
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
        setStep(modPrimarySlot === 1 ? 6 : 7);
        const failPayload: Record<string, unknown> = {
          ...profilePayload,
          profile_completed: false,
          onboarding_completed: false,
          onboarding_done: false,
        };
        const { error: bailErr } = await supabase
          .from("profiles")
          .upsert({ ...failPayload, id: authUser.id }, { onConflict: "id" });
        if (bailErr) {
          console.error("[Onboarding submit] upsert after photo rejection:", bailErr);
          setError(bailErr.message || "Erreur lors de l’enregistrement du profil.");
        }
        setLoading(false);
        return;
      }

      console.log("[Onboarding submit] sending data:", {
        table: "profiles",
        operation: "upsert",
        payload: profilePayload,
      });

      let profileUpsertSelect = PROFILE_UPSERT_ONBOARDING_SELECT;
      let { error: profileError, data: upsertRow } = await supabase
        .from("profiles")
        .upsert(
          {
            ...profilePayload,
            id: authUser.id,
          },
          { onConflict: "id" }
        )
        .select(profileUpsertSelect)
        .maybeSingle();

      if (profileError && isUndefinedColumnError(profileError, "location_source")) {
        console.warn("[Onboarding submit] upsert: colonne location_source absente, nouvel essai sans");
        const payloadCore = { ...profilePayload };
        delete (payloadCore as { location_source?: unknown }).location_source;
        profileUpsertSelect = PROFILE_UPSERT_ONBOARDING_SELECT_CORE;
        ({ error: profileError, data: upsertRow } = await supabase
          .from("profiles")
          .upsert(
            {
              ...payloadCore,
              id: authUser.id,
            },
            { onConflict: "id" }
          )
          .select(profileUpsertSelect)
          .maybeSingle());
      }

      console.log("[Onboarding submit] result:", {
        profileUpsert: { error: profileError?.message ?? null, data: upsertRow ?? null },
      });

      if (profileError || !upsertRow) {
        if (profileError) {
          console.error(
            "[Onboarding submit] profiles upsert failed — code:",
            profileError.code,
            "message:",
            profileError.message,
            profileError,
          );
          const msg = profileError.message || "";
          setError(
            /18 ans|réservé aux personnes/i.test(msg)
              ? "SPLove est réservé aux personnes de 18 ans ou plus."
              : msg || "Erreur lors de l’enregistrement du profil."
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

      commitProfileRow(upsertRow);

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
          console.error("[Onboarding submit] error:", deleteSportsErr);
          setError(deleteSportsErr.message);
          return;
        }

        const rows = validSportIds.map((sportId) => ({
          profile_id: authUserId,
          sport_id: sportId,
        }));

        const { error: sportsError, data: sportsData } = await supabase
          .from("profile_sports")
          .insert(rows)
          .select("sport_id");

        console.log("[Onboarding submit] result:", {
          profileSportsInsert: { error: sportsError?.message ?? null, rows: sportsData?.length ?? 0 },
        });

        if (sportsError) {
          console.error("[Onboarding submit] error:", sportsError);
          setError(sportsError.message);
          return;
        }
      }

      void refetchProfile();

      const gateOk =
        !!upsertRow.profile_completed && isAdultFromBirthIso(String(upsertRow.birth_date ?? ""));
      if (!gateOk) {
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
        console.error("[Onboarding submit] syncAuthSession: no session after success — redirect /auth");
        navigate("/auth", { replace: true });
        return;
      }
      if (moderationBanner) {
        await new Promise((r) => window.setTimeout(r, 1400));
      }
      console.log("[Onboarding submit] navigation /discover");
      navigate("/discover", { replace: true });
    } catch (err) {
      console.error("[Onboarding submit] error:", err);
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
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
              {step === 1 && "Vous, en quelques mots"}
              {step === 2 && "Où veux-tu rencontrer du monde ?"}
              {step === 3 && "Vos sports"}
              {step === 4 && "Votre rythme"}
              {step === 5 && "Une phrase qui vous ressemble"}
              {step === 6 && "Ajoutez votre photo"}
              {step === 7 && "Photo en pied"}
              {step === 8 && "Dernière étape"}
            </h1>
            <p className="mt-0.5 text-center text-xs leading-snug text-app-muted sm:text-sm">
              {step === 1 && "Ici, on se découvre en bougeant."}
              {step === 2 && "On te montre des profils autour de ta zone, sans afficher ton adresse exacte."}
              {step === 3 && "Choisissez 1 à 3 sports pour créer des affinités utiles."}
              {step === 4 && "Votre rythme nous aide à suggérer des rencontres réalistes."}
              {step === 5 && "Une phrase simple, vraie, sans lien ni réseau social."}
              {step === 6 &&
                "Photo 1 — visage clair, photo personnelle, sans filtre excessif."}
              {step === 7 &&
                "Photo 2 — silhouette / corps entier ou quasi entier, pour une rencontre en confiance."}
              {step === 8 && "Derniers accords, puis place aux vraies rencontres."}
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
                  <div>
                    <span className={labelClassName}>Type de rencontre *</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIntent(INTENT_DB_AMOUR)}
                        className={intentChoiceClass(intent === INTENT_DB_AMOUR)}
                        style={
                          intent === INTENT_DB_AMOUR
                            ? {
                                borderColor: BRAND_BG,
                                background: BRAND_BG,
                                color: TEXT_ON_BRAND,
                                ["--tw-ring-color" as string]: BRAND_BG,
                              }
                            : undefined
                        }
                      >
                        Amour
                      </button>
                      <button
                        type="button"
                        onClick={() => setIntent(INTENT_DB_AMICAL)}
                        className={intentChoiceClass(intent === INTENT_DB_AMICAL)}
                        style={
                          intent === INTENT_DB_AMICAL
                            ? {
                                borderColor: BRAND_BG,
                                background: BRAND_BG,
                                color: TEXT_ON_BRAND,
                              }
                            : undefined
                        }
                      >
                        Amical
                      </button>
                    </div>
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
                  <p className="text-xs text-app-muted">
                    1 à 3 sports · suggestions ci-dessous, ou recherche (min. 3 lettres)
                  </p>

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
                      placeholder="Ex. yoga, ski…"
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
                  <div>
                    <label className={labelClassName} htmlFor="ob-time">
                      Quand préférez-vous bouger ?
                    </label>
                    <select
                      id="ob-time"
                      value={sportTime}
                      onChange={(e) => setSportTime(e.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Pas de préférence</option>
                      {SPORT_TIME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={`${labelClassName} text-app-muted`}>
                      Qu’est-ce que vous aimez dans le sport ? (plusieurs choix)
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {SPORT_MOTIVATION_OPTIONS.map((option) => {
                        const isSelected = sportMotivations.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleMotivation(option)}
                            className="rounded-xl border-2 py-2 px-3 text-xs font-medium leading-snug sm:text-sm"
                            style={{
                              borderColor: isSelected ? BRAND_BG : APP_BORDER,
                              background: isSelected ? BRAND_BG : APP_CARD,
                              color: isSelected ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                            }}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-5">
                  <div>
                    <label className={labelClassName} htmlFor="ob-phrase">
                      Ta phrase en une ligne
                    </label>
                    <p className="mb-2 text-xs leading-snug text-app-muted">
                      Une phrase nette sur ton énergie ou ton style — pas une bio longue.
                    </p>
                    <input
                      id="ob-phrase"
                      type="text"
                      placeholder="Ex. Trail le dimanche matin, j’aime le rythme et l’air large."
                      value={sportPhrase}
                      maxLength={SPORT_PHRASE_MAX_LENGTH}
                      onChange={(e) => {
                        setSportPhrase(e.target.value.slice(0, SPORT_PHRASE_MAX_LENGTH));
                        setSportPhraseContactError(null);
                      }}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v.trim().length > 0 && bioPublicTextViolatesPolicy(v)) {
                          setSportPhraseContactError(SAFETY_CONTENT_REFUSAL);
                        } else {
                          setSportPhraseContactError(null);
                        }
                      }}
                      className={inputClassName}
                    />
                    <p className="mt-1 text-xs text-app-muted">
                      {sportPhrase.length}/{SPORT_PHRASE_MAX_LENGTH}
                    </p>
                    {sportPhraseContactError && (
                      <p className="mt-1.5 text-sm leading-snug text-red-600" role="alert">
                        {sportPhraseContactError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-3">
                  <ul className="space-y-1 rounded-xl border border-app-border bg-app-bg/90 px-3 py-2.5 text-[11px] leading-snug text-app-muted sm:text-xs">
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      Photo 1 : visage clair et identifiable (toi seul(e), de face ou trois-quarts).
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      Pas d’objets, paysages, logos, captures d’écran ni images téléchargées sur le web.
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      Pas de photo de groupe ni d’enfant seul sur l’image.
                    </li>
                  </ul>

                  {photoStepError && (
                    <p className="rounded-lg border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700" role="alert">
                      {photoStepError}
                    </p>
                  )}

                  <div className="mx-auto w-full max-w-[280px] space-y-1.5">
                    <span className={labelClassName}>Photo de profil *</span>
                    <p className="text-[11px] text-app-muted">
                      Elle sert de photo principale sur Discover et dans votre profil.
                    </p>
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
                          alt="Aperçu de votre photo de profil"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 px-2 py-6">
                          <span className="text-xs font-semibold text-app-text">Choisir une photo</span>
                          <span className="text-[10px] text-app-muted">JPG, PNG, WebP · max 5 Mo</span>
                        </span>
                      )}
                    </label>
                    {portraitPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => portraitInputRef.current?.click()}
                        className="w-full rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                      >
                        Remplacer la photo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-3">
                  <ul className="space-y-1 rounded-xl border border-app-border bg-app-bg/90 px-3 py-2.5 text-[11px] leading-snug text-app-muted sm:text-xs">
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      Photo 2 : silhouette / corps entier ou quasi entier, toi seul(e) sur l’image.
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      La silhouette doit être lisible (pas seulement un détail ou un accessoire).
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-app-muted">·</span>
                      Même interdits : objets, paysages, logos, captures d’écran, images non personnelles.
                    </li>
                  </ul>

                  {photoStepError && (
                    <p className="rounded-lg border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700" role="alert">
                      {photoStepError}
                    </p>
                  )}

                  <div className="mx-auto w-full max-w-[280px] space-y-1.5">
                    <span className={labelClassName}>Photo plein corps *</span>
                    <p className="text-[11px] text-app-muted">
                      Corps entier (ou quasi), debout de préférence.
                    </p>
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
                          alt="Aperçu photo plein corps"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 px-2 py-6">
                          <span className="text-xs font-semibold text-app-text">Choisir une photo</span>
                          <span className="text-[10px] text-app-muted">JPG, PNG, WebP · max 5 Mo</span>
                        </span>
                      )}
                    </label>
                    {bodyPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => bodyInputRef.current?.click()}
                        className="w-full rounded-xl border border-app-border bg-app-card py-2.5 text-sm font-semibold text-app-text hover:bg-app-border"
                      >
                        Remplacer la photo
                      </button>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-left text-sm leading-snug text-app-text">
                    <input
                      type="checkbox"
                      checked={photoComplianceConfirmed}
                      onChange={(e) => {
                        setPhotoComplianceConfirmed(e.target.checked);
                        if (e.target.checked) setPhotoStepError(null);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                    />
                    <span>{ONBOARDING_PHOTO_COMPLIANCE_LABEL}</span>
                  </label>
                </div>
              )}

              {step === 8 && (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-app-muted">{ACCESSIBILITY_SECTION_INTRO}</p>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-app-border bg-app-card px-3 py-2.5 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={needsAdaptedActivities}
                      onChange={(e) => setNeedsAdaptedActivities(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                    />
                    <span>{ACCESSIBILITY_SELF_LABEL}</span>
                  </label>
                  <div className="space-y-2 rounded-xl border border-app-border bg-app-bg/80 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                      Qui t’intéresse ?
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-app-text">
                      <input
                        type="checkbox"
                        checked={prefOpenToStandardActivity}
                        onChange={(e) => setPrefOpenToStandardActivity(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                      />
                      <span>{ACCESSIBILITY_PREF_STANDARD_LABEL}</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-app-text">
                      <input
                        type="checkbox"
                        checked={prefOpenToAdaptedActivity}
                        onChange={(e) => setPrefOpenToAdaptedActivity(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                      />
                      <span>{ACCESSIBILITY_PREF_ADAPTED_LABEL}</span>
                    </label>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={confirm18}
                      onChange={(e) => setConfirm18(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                    />
                    <span>Je confirme avoir 18 ans ou plus *</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-app-text">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-border"
                    />
                    <span>
                      J’accepte les Conditions d&apos;utilisation et la Politique de confidentialité *
                    </span>
                  </label>
                </div>
              )}

              {stepHint && step !== 6 && step !== 7 && (
                <p className="mt-3 text-sm text-red-600">{stepHint}</p>
              )}
              {finalStepBlockReason && (
                <p className="mt-3 text-sm text-red-600">{finalStepBlockReason}</p>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
                    onClick={goNext}
                    disabled={authLoading}
                    className="flex-1 rounded-xl py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
                  >
                    {step === 2 ? "Enregistrer ma localisation" : "Suivant"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading || authLoading}
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
