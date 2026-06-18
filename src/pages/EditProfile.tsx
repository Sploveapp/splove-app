import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MeetingAgeRangePreferencesPanel } from "../components/MeetingAgeRangePreferencesPanel";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import {
  APP_BG,
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import {
  SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK,
  SPLOVE_BOTTOM_NAV_HEIGHT_VAR,
} from "../constants/appBottomNavLayout";
import { normalizePreferredAgeRange } from "../lib/profileAge";
import { parseSportMatchPreference, type SportMatchPreferenceDb } from "../lib/sportMatchPreference";
import { useTranslation } from "../i18n/useTranslation";
import { antiExitValidator } from "../lib/antiExitValidator";
import {
  useProfilePhotoDisplaySrc,
} from "../hooks/useProfilePhotoDisplaySrc";
import { fetchProfileScreenFields, mergeProfileScreenRowPreservingPhotos } from "../lib/profileScreenHydrate";
import {
  logProfilePhotoUiDecision,
  resolveProfilePhotoUiSrc,
} from "../lib/profilePhotoDisplayUrl";
import { chainPhotoRenderHandlers, PhotoRenderLog } from "../lib/photoRenderLog";
import { useIosCapacitorImageDisplay } from "../hooks/useIosCapacitorImageDisplay";
import { coerceProfileHeightCm, parseHeightCmOptionalInput } from "../lib/profileHeightCm";
import { uploadProfilePhoto } from "../lib/profilePhotoUpload";

type SportOption = { id: string | number; name: string; category?: string | null };
type LookingForValue =
  | "women"
  | "men"
  | "trans_women"
  | "trans_men"
  | "non_binary"
  | "all";

const LOOKING_FOR_OPTIONS: { value: LookingForValue; label: string }[] = [
  { value: "women", label: "gender_preference.women" },
  { value: "men", label: "gender_preference.men" },
  { value: "trans_women", label: "gender_preference.trans_women" },
  { value: "trans_men", label: "gender_preference.trans_men" },
  { value: "non_binary", label: "gender_preference.non_binary" },
  { value: "all", label: "gender_preference.everyone" },
];

const INTENT_OPTIONS = [
  { value: "dating_feeling", label: "intentions.dating" },
  { value: "sport_social", label: "intentions.sport" },
  { value: "both", label: "intentions.both" },
] as const;

const EDIT_SPORT_MATCH_OPTIONS: readonly {
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

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

type EditProfilePhotoFields = {
  portrait_url?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
  fullbody_url?: string | null;
};

/** EditProfile : portrait d’abord (slot upload), puis repli main / avatar. */
function buildEditPrimaryPhotoCandidates(
  profile: EditProfilePhotoFields | null | undefined,
  localSavedUrl: string,
): { refs: string[]; fieldByRef: Record<string, string> } {
  const fieldOrder = ["portrait_url", "main_photo_url", "avatar_url"] as const;
  const refs: string[] = [];
  const fieldByRef: Record<string, string> = {};
  const seen = new Set<string>();
  const push = (key: (typeof fieldOrder)[number], value: unknown) => {
    const t = typeof value === "string" ? value.trim() : "";
    if (!t || seen.has(t)) return;
    seen.add(t);
    refs.push(t);
    fieldByRef[t] = key;
  };
  for (const key of fieldOrder) {
    push(key, profile?.[key]);
  }
  const local = localSavedUrl.trim();
  if (local && !seen.has(local)) {
    refs.push(local);
    fieldByRef[local] = "portrait_url";
  }
  return { refs, fieldByRef };
}

/** EditProfile : fullbody uniquement (+ URL locale post-upload). */
function buildEditSecondaryPhotoCandidates(
  profile: EditProfilePhotoFields | null | undefined,
  localSavedUrl: string,
): { refs: string[]; fieldByRef: Record<string, string> } {
  const refs: string[] = [];
  const fieldByRef: Record<string, string> = {};
  const fullbody =
    typeof profile?.fullbody_url === "string" ? profile.fullbody_url.trim() : "";
  if (fullbody) {
    refs.push(fullbody);
    fieldByRef[fullbody] = "fullbody_url";
  }
  const local = localSavedUrl.trim();
  if (local && local !== fullbody) {
    refs.push(local);
    fieldByRef[local] = "fullbody_url";
  }
  return { refs, fieldByRef };
}

function mergeBlobPreviewWithSavedRefs(
  previewUrl: string,
  hasPendingFile: boolean,
  savedRefs: string[],
): string[] {
  if (!hasPendingFile || !previewUrl.trim()) return savedRefs;
  const blob = previewUrl.trim();
  return [blob, ...savedRefs.filter((r) => r !== blob)];
}

function EditProfilePhotoPlaceholder({
  hint,
  loading = false,
}: {
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 5",
        borderRadius: 12,
        marginBottom: 10,
        border: `1px dashed ${APP_BORDER}`,
        background: APP_BG,
        color: APP_TEXT_MUTED,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden
        style={{ width: 44, height: 44, objectFit: "contain", opacity: loading ? 0.45 : 0.72 }}
      />
      {hint ? (
        <span style={{ fontSize: 12, fontWeight: 500, textAlign: "center" }}>{hint}</span>
      ) : null}
    </div>
  );
}

function mapDbIntentToUi(raw: unknown): (typeof INTENT_OPTIONS)[number]["value"] {
  const n = String(raw ?? "").trim().toLowerCase();
  if (n === "amical" || n === "friendly" || n === "sport_social") return "sport_social";
  if (n === "both") return "both";
  return "dating_feeling";
}

function mapUiIntentToDb(raw: (typeof INTENT_OPTIONS)[number]["value"]): string {
  if (raw === "sport_social") return "Amical";
  if (raw === "both") return "both";
  return "Amoureux";
}

function parseLookingFor(raw: unknown): LookingForValue[] {
  const list = Array.isArray(raw)
    ? raw.map((x) => String(x ?? ""))
    : String(raw ?? "")
        .split(",")
        .map((x) => x.trim());
  const out: LookingForValue[] = [];
  for (const item of list) {
    const n = item.toLowerCase();
    const mapped =
      n === "women" || n === "femme" || n === "femmes"
        ? "women"
        : n === "men" || n === "homme" || n === "hommes"
          ? "men"
          : n === "trans_women" || n === "femmes trans"
            ? "trans_women"
            : n === "trans_men" || n === "hommes trans"
              ? "trans_men"
              : n === "non_binary" || n === "non-binaire"
                ? "non_binary"
                : n === "all" || n === "tous"
                  ? "all"
                  : "";
    if (mapped && !out.includes(mapped as LookingForValue)) out.push(mapped as LookingForValue);
  }
  return out.includes("all") ? ["all"] : out;
}

export default function EditProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, refetchProfile, commitProfileRow } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [sportsCatalog, setSportsCatalog] = useState<SportOption[]>([]);
  const [selectedSports, setSelectedSports] = useState<SportOption[]>([]);
  const [sportSearch, setSportSearch] = useState("");

  const [intent, setIntent] = useState<(typeof INTENT_OPTIONS)[number]["value"]>("dating_feeling");
  const [lookingFor, setLookingFor] = useState<LookingForValue[]>([]);
  const [sportMatchPreference, setSportMatchPreference] = useState<SportMatchPreferenceDb>("same_sports");
  const [heightCmInput, setHeightCmInput] = useState("");
  const [bio, setBio] = useState("");

  const [portraitUrl, setPortraitUrl] = useState("");
  const [bodyUrl, setBodyUrl] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [bodyFile, setBodyFile] = useState<File | null>(null);
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState<string>("");
  const [bodyPreviewUrl, setBodyPreviewUrl] = useState<string>("");
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const primaryEditCandidates = useMemo(
    () => buildEditPrimaryPhotoCandidates(profile, portraitUrl),
    [profile, portraitUrl],
  );
  const secondaryEditCandidates = useMemo(
    () => buildEditSecondaryPhotoCandidates(profile, bodyUrl),
    [profile, bodyUrl],
  );

  const portraitRefs = useMemo(
    () =>
      mergeBlobPreviewWithSavedRefs(
        portraitPreviewUrl,
        Boolean(portraitFile),
        primaryEditCandidates.refs,
      ),
    [portraitPreviewUrl, portraitFile, primaryEditCandidates.refs],
  );

  const bodyRefs = useMemo(
    () =>
      mergeBlobPreviewWithSavedRefs(bodyPreviewUrl, Boolean(bodyFile), secondaryEditCandidates.refs),
    [bodyPreviewUrl, bodyFile, secondaryEditCandidates.refs],
  );

  const primaryPhotoLogContext = useMemo(
    () => ({
      userId: user?.id ?? null,
      profileId: profile?.id ?? user?.id ?? null,
      source: "edit_profile.screen",
      fieldByRef: primaryEditCandidates.fieldByRef,
    }),
    [user?.id, profile?.id, primaryEditCandidates.fieldByRef],
  );

  const secondaryPhotoLogContext = useMemo(
    () => ({
      userId: user?.id ?? null,
      profileId: profile?.id ?? user?.id ?? null,
      source: "edit_profile.screen",
      fieldByRef: secondaryEditCandidates.fieldByRef,
    }),
    [user?.id, profile?.id, secondaryEditCandidates.fieldByRef],
  );

  const primaryPhoto = useProfilePhotoDisplaySrc(portraitRefs, {
    logContext: primaryPhotoLogContext,
  });
  const secondaryPhoto = useProfilePhotoDisplaySrc(bodyRefs, {
    logContext: secondaryPhotoLogContext,
  });

  const primaryStoredRef = primaryEditCandidates.refs[0] ?? null;
  const secondaryStoredRef = secondaryEditCandidates.refs[0] ?? null;

  const primaryResolvedSrc = resolveProfilePhotoUiSrc(primaryPhoto.activeRef, primaryPhoto.src);
  const secondaryResolvedSrc = resolveProfilePhotoUiSrc(secondaryStoredRef, secondaryPhoto.src);

  /** URL distante résolue (signed/public) — afficher dès que le hook a un src, sans bloquer sur isLoading. */
  const primaryRemoteBase =
    primaryPhoto.isFailed && !primaryPhoto.src ? null : primaryResolvedSrc;

  /** iOS WKWebView : repli CapacitorHttp → data URL (même pattern que Profil). */
  const iosPrimaryPhoto = useIosCapacitorImageDisplay(
    portraitFile ? null : primaryRemoteBase,
  );

  const primaryImgSrc = portraitFile ? primaryRemoteBase : iosPrimaryPhoto.displaySrc;
  const secondaryImgSrc =
    secondaryPhoto.isFailed || (secondaryPhoto.isLoading && secondaryEditCandidates.refs.length > 0)
      ? null
      : secondaryResolvedSrc;

  const showPrimaryImg = portraitFile
    ? Boolean(primaryImgSrc)
    : Boolean(primaryImgSrc) &&
      !(iosPrimaryPhoto.resolutionFailed && !iosPrimaryPhoto.usingDataUrl);
  const showSecondaryImg = Boolean(secondaryImgSrc);

  useEffect(() => {
    logProfilePhotoUiDecision("edit_profile.screen", profile, primaryImgSrc, "primary");
    logProfilePhotoUiDecision("edit_profile.screen", profile, secondaryImgSrc, "secondary");
    PhotoRenderLog.displaySrc({
      screen: "EditProfile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "primary" },
    });
    PhotoRenderLog.resolvedUrl({
      screen: "EditProfile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "primary", urlIndex: primaryPhoto.urlIndex },
    });
    PhotoRenderLog.displaySrc({
      screen: "EditProfile",
      displaySrc: secondaryImgSrc,
      resolvedUrl: secondaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "secondary" },
    });
    PhotoRenderLog.resolvedUrl({
      screen: "EditProfile",
      displaySrc: secondaryImgSrc,
      resolvedUrl: secondaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "secondary", urlIndex: secondaryPhoto.urlIndex },
    });
  }, [
    profile,
    primaryImgSrc,
    secondaryImgSrc,
    primaryPhoto.src,
    secondaryPhoto.src,
    primaryPhoto.urlIndex,
    secondaryPhoto.urlIndex,
    user?.id,
  ]);

  const editPrimaryImgHandlers = chainPhotoRenderHandlers(
    {
      screen: "EditProfile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "primary" },
    },
    {
      onLoad: primaryPhoto.onImageLoad,
      onError: () => {
        if (!portraitFile) iosPrimaryPhoto.onImageError();
        primaryPhoto.onImageError();
      },
    },
  );

  const editSecondaryImgHandlers = chainPhotoRenderHandlers(
    {
      screen: "EditProfile",
      displaySrc: secondaryImgSrc,
      resolvedUrl: secondaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "secondary" },
    },
    { onLoad: secondaryPhoto.onImageLoad, onError: secondaryPhoto.onImageError },
  );

  const syncProfileForScreen = useCallback(async () => {
    if (!user?.id) return;
    const row = await fetchProfileScreenFields(user.id);
    if (!row) return;
    const base = profileRef.current;
    if (base?.id) {
      commitProfileRow(mergeProfileScreenRowPreservingPhotos(base as Record<string, unknown>, row));
    } else if (typeof row.id === "string") {
      commitProfileRow(row);
    }
  }, [user?.id, commitProfileRow]);

  useEffect(() => {
    void syncProfileForScreen();
  }, [syncProfileForScreen]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalogAndSports() {
      const { data: sportsData } = await supabase
        .from("sports")
        .select("id, label, category")
        .eq("active", true)
        .order("label", { ascending: true });
      if (cancelled) return;
      const catalog: SportOption[] = (sportsData ?? []).map((r) => ({
        id: r.id,
        name: String(r.label ?? "").trim(),
        category: (r.category as string | null) ?? null,
      }));
      setSportsCatalog(catalog);

      if (!user?.id) return;
      const { data: links } = await supabase
        .from("profile_sports")
        .select("sport_id")
        .eq("profile_id", user.id);
      if (cancelled || !links) return;
      const chosen = links
        .map((l) => catalog.find((c) => String(c.id) === String(l.sport_id)))
        .filter((x): x is SportOption => x != null)
        .slice(0, 3);
      setSelectedSports(chosen);
    }
    void loadCatalogAndSports();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!profile) return;
    setIntent(mapDbIntentToUi(profile.intent));
    setLookingFor(parseLookingFor(profile.looking_for));
    const hCoerced = coerceProfileHeightCm((profile as Record<string, unknown>).height_cm);
    setHeightCmInput(hCoerced != null ? String(hCoerced) : "");
    setBio(String((profile as Record<string, unknown>).sport_phrase ?? ""));
    const portraitFromDb = buildEditPrimaryPhotoCandidates(profile, "").refs[0] ?? "";
    setPortraitUrl(portraitFromDb);
    const bodyFromDb = buildEditSecondaryPhotoCandidates(profile, "").refs[0] ?? "";
    setBodyUrl(bodyFromDb);
    setSportMatchPreference(parseSportMatchPreference((profile as Record<string, unknown>).sport_match_preference));
  }, [profile]);

  useEffect(() => {
    if (!portraitFile) {
      setPortraitPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(portraitFile);
    setPortraitPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [portraitFile]);

  useEffect(() => {
    if (!bodyFile) {
      setBodyPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(bodyFile);
    setBodyPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bodyFile]);

  const searchMatches = useMemo(() => {
    const q = sportSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return sportsCatalog
      .filter((s) => {
        const hay = `${s.name} ${s.category ?? ""}`.toLowerCase();
        const already = selectedSports.some((x) => String(x.id) === String(s.id));
        return !already && hay.includes(q);
      })
      .slice(0, 10);
  }, [sportSearch, sportsCatalog, selectedSports]);

  const meetingAgePrefsBounds = useMemo(
    () => normalizePreferredAgeRange(profile?.preferred_age_min, profile?.preferred_age_max),
    [profile?.preferred_age_min, profile?.preferred_age_max],
  );

  const meetingAgePrefsRevisionKey = useMemo(() => {
    const uid = user?.id ?? "";
    const pr = profile as Record<string, unknown> | undefined;
    const ua = pr ? String(pr.updated_at ?? "") : "";
    return `edit-meet-age-${uid}-${ua}-${meetingAgePrefsBounds.min}-${meetingAgePrefsBounds.max}`;
  }, [user?.id, profile, meetingAgePrefsBounds.min, meetingAgePrefsBounds.max]);

  function toggleSport(sport: SportOption): void {
    setSelectedSports((prev) => {
      const exists = prev.some((x) => String(x.id) === String(sport.id));
      if (exists) return prev.filter((x) => String(x.id) !== String(sport.id));
      if (prev.length >= 3) return prev;
      return [...prev, sport];
    });
  }

  function toggleLookingFor(value: LookingForValue): void {
    setLookingFor((prev) => {
      if (value === "all") return prev.includes("all") ? [] : ["all"];
      const withoutAll = prev.filter((x) => x !== "all");
      if (withoutAll.includes(value)) return withoutAll.filter((x) => x !== value);
      return [...withoutAll, value];
    });
  }

  function handlePortraitFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setPortraitFile(null);
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setMessage(t("photos.file_too_large"));
      e.target.value = "";
      return;
    }
    setMessage(null);
    setPortraitFile(file);
  }

  function handleBodyFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setBodyFile(null);
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setMessage(t("photos.file_too_large"));
      e.target.value = "";
      return;
    }
    setMessage(null);
    setBodyFile(file);
  }

  async function handleSave(): Promise<void> {
    if (!user?.id) return;
    setLoading(true);
    setMessage(null);
    try {
      const bioTrim = bio.trim();
      if (bioTrim && antiExitValidator(bioTrim, "profile").isBlocked) {
        setMessage(t("safety_content_refusal"));
        setLoading(false);
        return;
      }

      let nextPortraitUrl: string | null = null;
      let nextBodyUrl: string | null = null;
      if (portraitFile) {
        const uploaded = await uploadProfilePhoto(supabase, user.id, portraitFile, "portrait");
        nextPortraitUrl = uploaded.storedRef;
      }
      if (bodyFile) {
        const uploaded = await uploadProfilePhoto(supabase, user.id, bodyFile, "activity");
        nextBodyUrl = uploaded.storedRef;
      }

      // Keep PATCH payload minimal and schema-safe to avoid PostgREST 400 on unknown columns.
      // Never send portrait_url / fullbody_url / main_photo_url as null or "" unless we are
      // replacing that slot via upload — DB trigger derives main_photo_url from portrait_url.
      const payload: Record<string, unknown> = {
        intent: mapUiIntentToDb(intent),
        looking_for: lookingFor.length ? lookingFor.join(",") : null,
        sport_phrase: bio.trim() || null,
        sport_match_preference: sportMatchPreference,
        height_cm: parseHeightCmOptionalInput(heightCmInput),
        updated_at: new Date().toISOString(),
      };
      if (nextPortraitUrl) payload.portrait_url = nextPortraitUrl;
      if (nextBodyUrl) payload.fullbody_url = nextBodyUrl;

      if (import.meta.env.DEV) {
        console.log("[EditProfile] profiles.update payload → Supabase", { ...payload });
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);
      if (profileError) {
        console.error("[EditProfile] profiles update error", {
          profileId: user.id,
          payload,
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          error: profileError,
        });
        throw profileError;
      }

      const selectedSportIds = Array.from(
        new Set(
          selectedSports
            .map((s) => String(s.id).trim())
            .filter((id) => id.length > 0)
        )
      );

      const { error: delErr } = await supabase
        .from("profile_sports")
        .delete()
        .eq("profile_id", user.id);
      if (delErr) {
        console.error("[EditProfile] profile_sports delete error", {
          profileId: user.id,
          selectedSportIds,
          code: delErr.code,
          message: delErr.message,
          details: delErr.details,
          hint: delErr.hint,
          error: delErr,
        });
        throw delErr;
      }

      if (selectedSportIds.length > 0) {
        const rows = selectedSportIds.map((sportId) => ({
          profile_id: user.id,
          sport_id: sportId,
          level: "regular",
          is_primary: false,
        }));
        if (rows.length > 0) {
          rows[0] = { ...rows[0], is_primary: true };
        }
        const { error: insErr } = await supabase
          .from("profile_sports")
          .insert(rows);
        if (insErr) {
          console.error("[EditProfile] profile_sports insert error", {
            profileId: user.id,
            selectedSportIds,
            rows,
            code: insErr.code,
            message: insErr.message,
            details: insErr.details,
            hint: insErr.hint,
            error: insErr,
          });
          throw insErr;
        }
      }

      await refetchProfile();
      await syncProfileForScreen();
      if (nextPortraitUrl) {
        setPortraitUrl(nextPortraitUrl);
        setPortraitFile(null);
        setPortraitPreviewUrl("");
      }
      if (nextBodyUrl) {
        setBodyUrl(nextBodyUrl);
        setBodyFile(null);
        setBodyPreviewUrl("");
      }
      if (profile && (nextPortraitUrl || nextBodyUrl)) {
        commitProfileRow({
          ...profile,
          ...(nextPortraitUrl
            ? { portrait_url: nextPortraitUrl, main_photo_url: nextPortraitUrl }
            : {}),
          ...(nextBodyUrl ? { fullbody_url: nextBodyUrl } : {}),
        });
      }
      setPortraitFile(null);
      setBodyFile(null);
      navigate("/move", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("edit_profile_save_error");
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: APP_BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <main
        style={{
          padding: "24px",
          paddingBottom: `calc(24px + var(${SPLOVE_BOTTOM_NAV_HEIGHT_VAR}, ${SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK}))`,
          maxWidth: "560px",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ margin: "0 0 18px 0", fontSize: "22px", fontWeight: 700, color: APP_TEXT }}>{t("edit_profile")}</h1>

        {user?.id ? (
          <MeetingAgeRangePreferencesPanel
            userId={user.id}
            revisionKey={meetingAgePrefsRevisionKey}
            preferredMinResolved={meetingAgePrefsBounds.min}
            preferredMaxResolved={meetingAgePrefsBounds.max}
            onAfterSuccessfulSave={async (min, max) => {
              if (profile) {
                commitProfileRow({
                  ...profile,
                  preferred_age_min: min,
                  preferred_age_max: max,
                });
              }
              await syncProfileForScreen();
            }}
          />
        ) : null}

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("sport_match_pref_section_title")}</h2>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: APP_TEXT_MUTED, lineHeight: 1.45 }}>{t("sport_match_pref_section_hint")}</p>
          <div style={{ display: "grid", gap: 8 }}>
            {EDIT_SPORT_MATCH_OPTIONS.map((opt) => {
              const active = sportMatchPreference === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setSportMatchPreference(opt.value)} style={{ border: `1px solid ${active ? BRAND_BG : APP_BORDER}`, background: active ? BRAND_BG : APP_BG, color: active ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "12px", textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t(opt.labelKey)}</div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      color: active ? TEXT_ON_BRAND : APP_TEXT_MUTED,
                      opacity: active ? 0.92 : 1,
                    }}
                  >
                    {t(opt.descKey)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("sports_limit")}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {selectedSports.map((s) => (
              <button key={String(s.id)} type="button" onClick={() => toggleSport(s)} style={{ border: `1px solid ${BRAND_BG}`, background: BRAND_BG, color: TEXT_ON_BRAND, borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>
                {s.name} ×
              </button>
            ))}
          </div>
          <input value={sportSearch} onChange={(e) => setSportSearch(e.target.value)} placeholder={t("search_sport")} style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "10px 12px", borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT }} />
          {searchMatches.length > 0 ? (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {searchMatches.map((s) => (
                <button key={String(s.id)} type="button" onClick={() => toggleSport(s)} style={{ border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT_MUTED, borderRadius: 12, padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("intentions.title")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {INTENT_OPTIONS.map((opt) => {
              const active = intent === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setIntent(opt.value)} style={{ border: `1px solid ${active ? BRAND_BG : APP_BORDER}`, background: active ? BRAND_BG : APP_BG, color: active ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600 }}>
                  {t(opt.label)}
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("gender_preference.title")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            {LOOKING_FOR_OPTIONS.map((opt) => {
              const active = lookingFor.includes(opt.value);
              return (
                <button key={opt.value} type="button" onClick={() => toggleLookingFor(opt.value)} style={{ border: `1px solid ${active ? BRAND_BG : APP_BORDER}`, background: active ? BRAND_BG : APP_BG, color: active ? TEXT_ON_BRAND : APP_TEXT, borderRadius: 12, padding: "10px 8px", fontSize: 13, fontWeight: 600 }}>
                  {t(opt.label)}
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <label style={{ margin: "0 0 6px", display: "block", fontSize: 15, fontWeight: 600, color: APP_TEXT }} htmlFor="edit-profile-height">
            {t("onboarding_height_label")}
          </label>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: APP_TEXT_MUTED, lineHeight: 1.45 }}>{t("onboarding_step1_micro_height_hint")}</p>
          <input
            id="edit-profile-height"
            type="text"
            inputMode="numeric"
            value={heightCmInput}
            onChange={(e) => setHeightCmInput(e.target.value)}
            placeholder={t("onboarding_height_placeholder")}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT }}
          />
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("profile.bio_title")}</h2>
          <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} rows={4} placeholder={t("profile.bio_placeholder")} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_BG, color: APP_TEXT, resize: "vertical" }} />
        </section>

        <section style={{ background: APP_CARD, borderRadius: 16, border: `1px solid ${APP_BORDER}`, padding: 16, marginBottom: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15, color: APP_TEXT }}>{t("photos.title")}</h2>
          {loading ? (
            <p style={{ margin: "0 0 12px", fontSize: 12, color: APP_TEXT_MUTED }}>{t("loading")}</p>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div style={{ border: `1px solid ${APP_BORDER}`, borderRadius: 14, padding: 10, background: APP_BG }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: APP_TEXT_MUTED }}>{t("photos.primary")}</p>
              {showPrimaryImg ? (
                <img
                  key={`primary-${primaryPhoto.activeRef ?? primaryStoredRef ?? "none"}-${primaryPhoto.urlIndex}-${iosPrimaryPhoto.usingDataUrl ? "data" : "remote"}`}
                  src={primaryImgSrc ?? undefined}
                  alt={t("photos.primary")}
                  onLoad={editPrimaryImgHandlers.onLoad}
                  onError={editPrimaryImgHandlers.onError}
                  style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                />
              ) : (
                <EditProfilePhotoPlaceholder
                  loading={
                    primaryPhoto.isLoading &&
                    Boolean(primaryStoredRef) &&
                    !primaryImgSrc
                  }
                />
              )}
              <input
                id="edit-profile-portrait-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePortraitFileChange}
                disabled={loading}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              />
              <label
                htmlFor="edit-profile-portrait-file"
                aria-disabled={loading}
                style={{
                  display: "inline-flex",
                  width: "100%",
                  justifyContent: "center",
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 10,
                  background: APP_CARD,
                  color: APP_TEXT,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  pointerEvents: loading ? "none" : "auto",
                }}
              >
                {t("replace_photo")}
              </label>
            </div>
            <div style={{ border: `1px solid ${APP_BORDER}`, borderRadius: 14, padding: 10, background: APP_BG }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: APP_TEXT_MUTED }}>{t("photos.secondary")}</p>
              {showSecondaryImg ? (
                <img
                  key={`secondary-${secondaryPhoto.activeRef ?? secondaryStoredRef ?? "none"}-${secondaryPhoto.urlIndex}`}
                  src={secondaryImgSrc ?? undefined}
                  alt={t("photos.secondary")}
                  onLoad={editSecondaryImgHandlers.onLoad}
                  onError={editSecondaryImgHandlers.onError}
                  style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                />
              ) : (
                <EditProfilePhotoPlaceholder
                  loading={secondaryPhoto.isLoading && Boolean(secondaryStoredRef)}
                />
              )}
              <input
                id="edit-profile-body-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleBodyFileChange}
                disabled={loading}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              />
              <label
                htmlFor="edit-profile-body-file"
                aria-disabled={loading}
                style={{
                  display: "inline-flex",
                  width: "100%",
                  justifyContent: "center",
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 10,
                  background: APP_CARD,
                  color: APP_TEXT,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  pointerEvents: loading ? "none" : "auto",
                }}
              >
                {t("replace_photo")}
              </label>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => navigate("/profile", { replace: true })} style={{ flex: 1, borderRadius: 12, border: `1px solid ${APP_BORDER}`, background: APP_CARD, color: APP_TEXT, padding: "12px 14px", fontWeight: 600 }}>
            {t("back")}
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={loading} style={{ flex: 1, borderRadius: 12, border: "none", background: loading ? CTA_DISABLED_BG : BRAND_BG, color: TEXT_ON_BRAND, padding: "12px 14px", fontWeight: 700 }}>
            {loading ? t("loading") : t("save")}
          </button>
        </div>
        {message ? <p style={{ margin: "10px 2px 0", color: APP_TEXT_MUTED, fontSize: 13 }}>{message}</p> : null}
      </main>
    </div>
  );
}

