import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ACTIVITY_PROPOSALS_REFRESH_EVENT } from "../constants";
import { fetchActivityProposalsPendingActionCount } from "../lib/activityProposalPendingAction";
import { ACCESSIBILITY_PREF_BOTH_REQUIRED } from "../constants/copy";
import { VerifiedBadge } from "../components/VerifiedBadge";
import {
  collectPhotoRejectionUserMessages,
  hasProfilePhotosModerationValidated,
  isIdentityVerified,
} from "../lib/profileVerification";
import { bioPublicTextViolatesPolicy } from "../lib/contentModeration";
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
import { supabase } from "../lib/supabase";
import { getCurrentPositionCoords } from "../utils/geolocation";
import { forwardGeocodeFirst, reverseGeocodeCity } from "../lib/geocoding";
import { formatCityDisplay, normalizePrimaryLocalityLabel } from "../lib/formatCityDisplay";
import { updateProfileLocation } from "../lib/profileLocation";
import { dismissKeyboardAndBlurInputs } from "../lib/dismissKeyboardFocus";
import { IconSignOut } from "../components/ui/Icon";

const SPORT_PHRASE_MAX_LEN = 120;

const SPORT_PHRASE_SAVED_FLAG = "__phrase_saved__";
const ACCESSIBILITY_SAVE_SUCCESS = "Preferences enregistrees.";

const sectionHeadingButtonStyle: CSSProperties = {
  margin: "0 0 12px 0",
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  display: "block",
  width: "100%",
  textAlign: "left",
  fontSize: "16px",
  fontWeight: 600,
  color: APP_TEXT,
};
import { useTranslation } from "../i18n/useTranslation";
import { buildAuthReferralLink, fetchGrowthProfileFields, type GrowthProfileRow } from "../services/referral.service";
import {
  primaryProfilePhotoRefCandidates,
  useProfilePhotoDisplaySrc,
} from "../hooks/useProfilePhotoDisplaySrc";
import { snapshotProfilePhotoFields } from "../lib/profilePhotoPipelineLog";
import { fetchProfileScreenFields, mergeProfileScreenRowPreservingPhotos } from "../lib/profileScreenHydrate";
import {
  logProfilePhotoUiDecision,
  pickPrimaryProfilePhotoStoredRef,
  resolveProfilePhotoUiSrc,
} from "../lib/profilePhotoDisplayUrl";
import { chainPhotoRenderHandlers, PhotoRenderLog } from "../lib/photoRenderLog";
import LanguageSwitcher from "../components/LanguageSwitcher";
import {
  SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK,
  SPLOVE_BOTTOM_NAV_HEIGHT_VAR,
} from "../constants/appBottomNavLayout";
import { MeetingAgeRangePreferencesPanel } from "../components/MeetingAgeRangePreferencesPanel";
import { normalizeDiscoveryRadiusKm } from "../constants/discoverGeo";
import { normalizePreferredAgeRange } from "../lib/profileAge";

function ProfilePhotoPlaceholder({
  aspectRatio = "3 / 4",
  hint,
  loading = false,
}: {
  aspectRatio?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio,
        borderRadius: 16,
        border: `1px dashed ${APP_BORDER}`,
        background: APP_BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden
        style={{
          width: 48,
          height: 48,
          objectFit: "contain",
          opacity: loading ? 0.45 : 0.72,
        }}
      />
      {hint ? (
        <span style={{ fontSize: 12, fontWeight: 500, color: APP_TEXT_MUTED, textAlign: "center" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default function Profile() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, refetchProfile, commitProfileRow, signOut, isSigningOut } = useAuth();
  const photoCandidates = useMemo(() => primaryProfilePhotoRefCandidates(profile), [profile]);
  const primaryStoredRef = useMemo(() => pickPrimaryProfilePhotoStoredRef(profile), [profile]);
  const hasProfilePhotoRef = Boolean(primaryStoredRef);
  const primaryPhoto = useProfilePhotoDisplaySrc(photoCandidates.refs, {
    logContext: {
      userId: user?.id ?? null,
      profileId: profile?.id ?? user?.id ?? null,
      source: "profile.screen",
      fieldByRef: photoCandidates.fieldByRef,
    },
  });
  const primaryImgSrc = resolveProfilePhotoUiSrc(primaryStoredRef, primaryPhoto.src);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

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
    if (!user?.id) return;
    logProfilePhotoUiDecision("profile.screen", profile, primaryImgSrc, "primary");
    PhotoRenderLog.displaySrc({
      screen: "Profile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user.id, slot: "primary" },
    });
    PhotoRenderLog.resolvedUrl({
      screen: "Profile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user.id, slot: "primary", urlIndex: primaryPhoto.urlIndex },
    });
    console.log("[SPLovePhoto][connected-profile] profile_snapshot", {
      userId: user.id,
      profileId: profile?.id ?? user.id,
      source: "profile.screen",
      photos: snapshotProfilePhotoFields(profile as Record<string, unknown> | null | undefined),
      activeField: primaryPhoto.activeField,
      hasDisplaySrc: Boolean(primaryImgSrc),
      isLoading: primaryPhoto.isLoading,
      isFailed: primaryPhoto.isFailed,
    });
  }, [
    user?.id,
    profile?.id,
    profile?.main_photo_url,
    profile?.portrait_url,
    profile?.fullbody_url,
    profile?.avatar_url,
    primaryPhoto.activeField,
    primaryImgSrc,
    primaryPhoto.src,
    primaryPhoto.urlIndex,
    primaryPhoto.isLoading,
    primaryPhoto.isFailed,
    profile,
  ]);

  useEffect(() => {
    if (!selectedPhotoUrl) return;
    PhotoRenderLog.displaySrc({
      screen: "Profile",
      displaySrc: selectedPhotoUrl,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, view: "fullscreen_modal" },
    });
  }, [selectedPhotoUrl, primaryPhoto.src, profile, user?.id]);

  const profilePrimaryImgHandlers = chainPhotoRenderHandlers(
    {
      screen: "Profile",
      displaySrc: primaryImgSrc,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, slot: "primary" },
    },
    { onLoad: primaryPhoto.onImageLoad, onError: primaryPhoto.onImageError },
  );

  const profileFullscreenImgHandlers = chainPhotoRenderHandlers(
    {
      screen: "Profile",
      displaySrc: selectedPhotoUrl,
      resolvedUrl: primaryPhoto.src,
      profile,
      extra: { profileId: profile?.id ?? user?.id ?? null, view: "fullscreen_modal" },
    },
  );
  const [growth, setGrowth] = useState<GrowthProfileRow | null>(null);
  const [growthLinkCopied, setGrowthLinkCopied] = useState(false);
  const [needsAdaptedActivities, setNeedsAdaptedActivities] = useState(false);
  const [prefOpenToStandard, setPrefOpenToStandard] = useState(true);
  const [prefOpenToAdapted, setPrefOpenToAdapted] = useState(true);
  const [accessibilitySaving, setAccessibilitySaving] = useState(false);
  const [accessibilityMessage, setAccessibilityMessage] = useState<string | null>(null);
  const [locCity, setLocCity] = useState("");
  const [locRadius, setLocRadius] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locMessage, setLocMessage] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [phraseDraft, setPhraseDraft] = useState("");
  const [phraseSaving, setPhraseSaving] = useState(false);
  const [phraseMessage, setPhraseMessage] = useState<string | null>(null);
  const [activityPendingCount, setActivityPendingCount] = useState(0);
  const locCityInputRef = useRef<HTMLInputElement>(null);
  const locRadiusSelectRef = useRef<HTMLSelectElement>(null);

  const syncAccessibilityFromProfile = useCallback(() => {
    if (!profile) return;
    setNeedsAdaptedActivities(!!profile.needs_adapted_activities);
    setPrefOpenToStandard(true);
    setPrefOpenToAdapted(true);
  }, [profile]);

  useEffect(() => {
    syncAccessibilityFromProfile();
  }, [syncAccessibilityFromProfile]);

  const loadActivityPendingCount = useCallback(async () => {
    if (!user?.id) {
      setActivityPendingCount(0);
      return;
    }
    const n = await fetchActivityProposalsPendingActionCount(user.id);
    setActivityPendingCount(n);
  }, [user?.id]);

  useEffect(() => {
    void loadActivityPendingCount();
  }, [loadActivityPendingCount]);

  useEffect(() => {
    const onRefresh = () => {
      void loadActivityPendingCount();
    };
    window.addEventListener(ACTIVITY_PROPOSALS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ACTIVITY_PROPOSALS_REFRESH_EVENT, onRefresh);
  }, [loadActivityPendingCount]);

  useEffect(() => {
    if (!profile) return;
    const pr = profile as Record<string, unknown>;
    setPhraseDraft(typeof pr.sport_phrase === "string" ? pr.sport_phrase : "");
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const pr = profile as Record<string, unknown>;
    setLocCity(typeof pr.city === "string" ? formatCityDisplay(pr.city) || pr.city.trim() : "");
    const normalizedR = normalizeDiscoveryRadiusKm(pr.discovery_radius_km);
    setLocRadius(String(normalizedR ?? 25));
  }, [profile]);

  const preferredMeetingAgeBounds = useMemo(
    () => normalizePreferredAgeRange(profile?.preferred_age_min, profile?.preferred_age_max),
    [profile?.preferred_age_min, profile?.preferred_age_max],
  );

  const meetingAgePrefsRevisionKey = useMemo(() => {
    const pr = profile as Record<string, unknown> | undefined;
    const ua = pr ? String(pr.updated_at ?? "") : "";
    return `profile-meet-age-${user?.id ?? ""}-${ua}-${preferredMeetingAgeBounds.min}-${preferredMeetingAgeBounds.max}`;
  }, [user?.id, profile, preferredMeetingAgeBounds.min, preferredMeetingAgeBounds.max]);

  useEffect(() => {
    if (!selectedPhotoUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPhotoUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPhotoUrl]);

  useEffect(() => {
    if (accessibilityMessage !== ACCESSIBILITY_SAVE_SUCCESS) return;
    const t = window.setTimeout(() => setAccessibilityMessage(null), 1500);
    return () => window.clearTimeout(t);
  }, [accessibilityMessage]);

  useEffect(() => {
    if (phraseMessage !== SPORT_PHRASE_SAVED_FLAG) return;
    const timer = window.setTimeout(() => setPhraseMessage(null), 2000);
    return () => window.clearTimeout(timer);
  }, [phraseMessage]);

  // Disabled temporarily: active meeting mode caused profile reload loop
  // (meetup mode tick interval + is_active_mode Supabase sync + refetch removed)

  useEffect(() => {
    if (!user?.id) return;
    void fetchGrowthProfileFields(user.id).then(setGrowth);
  }, [user?.id]);

  async function handleLogout() {
    if (isSigningOut) return;
    await signOut();
  }

  const redirectToMoveAfterSave = useCallback(() => {
    navigate("/move", { replace: true });
  }, [navigate]);

  async function handleSaveSportPhrase() {
    if (!user?.id) return;
    const phraseText = phraseDraft.trim();
    if (phraseText.length > 0 && bioPublicTextViolatesPolicy(phraseText)) {
      setPhraseMessage(t("safety_content_refusal"));
      return;
    }
    setPhraseSaving(true);
    setPhraseMessage(null);
    try {
      console.log("[PROFILE_QUERY_SAFE]", {
        sport_phrase: phraseText.length > 0 ? phraseText.slice(0, SPORT_PHRASE_MAX_LEN) : null,
      });
      const { error } = await supabase
        .from("profiles")
        .update({
          sport_phrase: phraseText.length > 0 ? phraseText.slice(0, SPORT_PHRASE_MAX_LEN) : null,
        })
        .eq("id", user.id);
      if (error) {
        setPhraseMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      await syncProfileForScreen();
      redirectToMoveAfterSave();
    } finally {
      setPhraseSaving(false);
    }
  }

  async function handleSaveLocation() {
    if (!user?.id || !profile) return;
    dismissKeyboardAndBlurInputs([locCityInputRef, locRadiusSelectRef]);
    setLocMessage(null);
    setLocSaving(true);
    try {
      const radiusFinal = normalizeDiscoveryRadiusKm(Number(locRadius)) ?? 25;
      const pr = profile as Record<string, unknown>;
      let lat = typeof pr.latitude === "number" && Number.isFinite(pr.latitude) ? pr.latitude : null;
      let lng = typeof pr.longitude === "number" && Number.isFinite(pr.longitude) ? pr.longitude : null;
      const cityTrim = locCity.trim();
      const cityQuery = normalizePrimaryLocalityLabel(cityTrim) || cityTrim;
      if (cityTrim.length >= 2 && (lat == null || lng == null)) {
        const resolved = await forwardGeocodeFirst(cityQuery);
        if (!resolved) {
          setLocMessage(t("location_city_pick_list_prompt"));
          return;
        }
        lat = resolved.lat;
        lng = resolved.lng;
      }
      const { error } = await updateProfileLocation(supabase, user.id, {
        city: cityTrim || null,
        latitude: lat,
        longitude: lng,
        discovery_radius_km: radiusFinal,
      });
      if (error) {
        setLocMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      await syncProfileForScreen();
      redirectToMoveAfterSave();
    } finally {
      setLocSaving(false);
    }
  }

  async function handleUseMyLocation() {
    if (!user?.id || !profile) return;
    dismissKeyboardAndBlurInputs([locCityInputRef, locRadiusSelectRef]);
    setLocMessage(null);
    setGeoLoading(true);
    try {
      const c = await getCurrentPositionCoords();
      if (!c) {
        setLocMessage("Position indisponible. Verifie les autorisations ou saisis ta ville.");
        return;
      }
      const radiusFinal = normalizeDiscoveryRadiusKm(Number(locRadius)) ?? 25;
      const cityLabel = await reverseGeocodeCity(c.lat, c.lng);
      const resolvedCity = (cityLabel ?? locCity.trim()) || null;
      const { error } = await updateProfileLocation(supabase, user.id, {
        city: resolvedCity,
        latitude: c.lat,
        longitude: c.lng,
        discovery_radius_km: radiusFinal,
      });
      if (error) {
        setLocMessage(error.message || t("action_impossible"));
        return;
      }
      if (resolvedCity) {
        setLocCity(formatCityDisplay(resolvedCity) || resolvedCity);
      }
      await refetchProfile();
      await syncProfileForScreen();
      requestAnimationFrame(() => {
        dismissKeyboardAndBlurInputs([locCityInputRef, locRadiusSelectRef]);
      });
      redirectToMoveAfterSave();
    } finally {
      setGeoLoading(false);
    }
  }

  async function handleSaveAccessibility() {
    if (!user?.id) return;
    if (!prefOpenToStandard && !prefOpenToAdapted) {
      setAccessibilityMessage(ACCESSIBILITY_PREF_BOTH_REQUIRED);
      return;
    }
    setAccessibilityMessage(null);
    setAccessibilitySaving(true);
    try {
      console.log("[PROFILE_QUERY_SAFE]", { needs_adapted_activities: needsAdaptedActivities });
      const { error } = await supabase
        .from("profiles")
        .update({
          needs_adapted_activities: needsAdaptedActivities,
        })
        .eq("id", user.id);
      if (error) {
        setAccessibilityMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      await syncProfileForScreen();
      redirectToMoveAfterSave();
    } finally {
      setAccessibilitySaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: APP_BG,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <main
        style={{
          padding: "24px",
          paddingBottom: `calc(24px + var(${SPLOVE_BOTTOM_NAV_HEIGHT_VAR}, ${SPLOVE_BOTTOM_NAV_HEIGHT_FALLBACK}))`,
          maxWidth: "420px",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            fontWeight: 600,
            color: APP_TEXT_MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("profile_title")}
        </h1>

        <button
          type="button"
          onClick={() => navigate("/mes-rencontres")}
          style={{
            width: "100%",
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "14px",
            border: `1px solid ${APP_BORDER}`,
            background: APP_CARD,
            color: APP_TEXT,
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            position: "relative",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {t("my_meetups")}
            {activityPendingCount > 0 ? (
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#FF3B3B",
                  flexShrink: 0,
                }}
              />
            ) : null}
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/invite")}
          style={{
            width: "100%",
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "14px",
            border: `1px solid ${APP_BORDER}`,
            background: APP_CARD,
            color: APP_TEXT,
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {t("invite_friend_header")}
        </button>

        <button
          type="button"
          onClick={() => navigate("/profile/edit")}
          style={{
            width: "100%",
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "14px",
            border: `1px solid ${APP_BORDER}`,
            background: APP_CARD,
            color: APP_TEXT,
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {t("edit_profile")}
        </button>

        {user && (
          <>
          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                ...sectionHeadingButtonStyle,
                cursor: "default",
              }}
              className="select-none"
            >
              {t("photos.primary")}
            </span>
            {hasProfilePhotoRef ? (
              <button
                type="button"
                onClick={() => {
                  if (primaryImgSrc) setSelectedPhotoUrl(primaryImgSrc);
                }}
                aria-label={t("view_photo")}
                disabled={!primaryImgSrc}
                style={{
                  marginBottom: "16px",
                  padding: 0,
                  border: "none",
                  borderRadius: "16px",
                  overflow: "hidden",
                  maxWidth: "220px",
                  cursor: primaryImgSrc ? "pointer" : "default",
                  display: "block",
                  background: "none",
                }}
              >
                {primaryImgSrc ? (
                  <img
                    key={`${primaryPhoto.activeRef ?? primaryStoredRef ?? "none"}-${primaryPhoto.urlIndex}`}
                    src={primaryImgSrc}
                    alt="Votre photo de profil — appuyez pour les options"
                    onLoad={profilePrimaryImgHandlers.onLoad}
                    onError={profilePrimaryImgHandlers.onError}
                    style={{
                      width: "100%",
                      aspectRatio: "3 / 4",
                      objectFit: "cover",
                      display: "block",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <ProfilePhotoPlaceholder
                    aspectRatio="3 / 4"
                    loading={primaryPhoto.isLoading}
                  />
                )}
              </button>
            ) : (
              <div style={{ marginBottom: "16px", maxWidth: "220px" }}>
                <ProfilePhotoPlaceholder
                  aspectRatio="3 / 4"
                  hint="Aucune photo principale enregistrée"
                />
              </div>
            )}
            <div>
              <span
                style={{
                  display: "block",
                  margin: "0 0 12px 0",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: APP_TEXT,
                }}
              >
                {t("profile_verification.title")}
              </span>
              {profile && isIdentityVerified(profile) ? (
                <>
                  <div
                    style={{
                      marginBottom: "10px",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <VerifiedBadge />
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 500,
                      color: APP_TEXT_MUTED,
                      lineHeight: 1.5,
                    }}
                  >
                    {t("profile_verification.verified_body")}
                  </p>
                </>
              ) : profile && hasProfilePhotosModerationValidated(profile) ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 500,
                    color: APP_TEXT_MUTED,
                    lineHeight: 1.5,
                  }}
                >
                  {t("profile_verification.photo_validated_hint")}
                </p>
              ) : (
                <div>
                  {(() => {
                    const s = (profile?.photo_status ?? "").toLowerCase();
                    if (s === "rejected") {
                      const lines = profile ? collectPhotoRejectionUserMessages(profile) : [];
                      return (
                        <>
                          <p
                            style={{
                              margin: "0 0 10px 0",
                              fontSize: "15px",
                              fontWeight: 500,
                              color: APP_TEXT_MUTED,
                              lineHeight: 1.5,
                            }}
                          >
                            Photos refusées — renvoie des images perso, visage + silhouette visibles.
                          </p>
                          {lines.length > 0 ? (
                            <ul
                              style={{
                                margin: 0,
                                paddingLeft: "1.1rem",
                                fontSize: "14px",
                                color: APP_TEXT_MUTED,
                                lineHeight: 1.5,
                              }}
                            >
                              {lines.map((line) => (
                                <li key={line} style={{ marginBottom: "6px" }}>
                                  {line}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      );
                    }
                    if (s === "review" || s === "pending" || s === "") {
                      return (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "15px",
                            fontWeight: 500,
                            color: APP_TEXT_MUTED,
                            lineHeight: 1.5,
                          }}
                        >
                          {t("profile_verification.pending")}
                        </p>
                      );
                    }
                    return (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: 500,
                          color: APP_TEXT_MUTED,
                          lineHeight: 1.5,
                        }}
                      >
                        {t("profile_verification.not_verified_body")}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "16px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("sport_phrase.title")}
            </h2>
            <p
              style={{
                margin: "0 0 12px 0",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {t("sport_phrase.description")}
            </p>
            <textarea
              value={phraseDraft}
              onChange={(e) => {
                setPhraseDraft(e.target.value.slice(0, SPORT_PHRASE_MAX_LEN));
                setPhraseMessage(null);
              }}
              rows={3}
              maxLength={SPORT_PHRASE_MAX_LEN}
              placeholder={t("sport_phrase.placeholder")}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: "12px",
                border: `1px solid ${APP_BORDER}`,
                background: APP_BG,
                color: APP_TEXT,
                fontSize: "15px",
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: "88px",
              }}
            />
            <p style={{ margin: "6px 0 12px 0", fontSize: "12px", color: APP_TEXT_MUTED }}>
              {phraseDraft.length}/{SPORT_PHRASE_MAX_LEN}
            </p>
            <button
              type="button"
              onClick={() => void handleSaveSportPhrase()}
              disabled={phraseSaving}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "none",
                fontSize: "15px",
                fontWeight: 600,
                cursor: phraseSaving ? "wait" : "pointer",
                background: phraseSaving ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
              }}
            >
              {phraseSaving ? t("loading") : t("sport_phrase.save")}
            </button>
            {phraseMessage ? (
              <p style={{ margin: "10px 0 0 0", fontSize: "14px", color: APP_TEXT_MUTED }}>
                {phraseMessage === SPORT_PHRASE_SAVED_FLAG ? t("sport_phrase.saved") : phraseMessage}
              </p>
            ) : null}
          </div>

          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "20px 24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "16px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("profile_meetings_title")}
            </h2>
            <p
              style={{
                margin: "0 0 14px 0",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {t("meetups.preferences_description")}
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                marginBottom: "14px",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={needsAdaptedActivities}
                onChange={(e) => {
                  setNeedsAdaptedActivities(e.target.checked);
                  setAccessibilityMessage(null);
                }}
                style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0 }}
              />
              <span>{t("meetups.mobility_adapted")}</span>
            </label>
            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: APP_TEXT_MUTED,
              }}
            >
              {t("profile_who_interests")}
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                marginBottom: "10px",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={prefOpenToStandard}
                onChange={(e) => {
                  setPrefOpenToStandard(e.target.checked);
                  setAccessibilityMessage(null);
                }}
                style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0 }}
              />
              <span>{t("meetups.interested_classic_profiles")}</span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                marginBottom: "14px",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={prefOpenToAdapted}
                onChange={(e) => {
                  setPrefOpenToAdapted(e.target.checked);
                  setAccessibilityMessage(null);
                }}
                style={{ marginTop: "3px", width: "16px", height: "16px", flexShrink: 0 }}
              />
              <span>{t("meetups.interested_adapted_profiles")}</span>
            </label>
            {accessibilityMessage && accessibilityMessage !== ACCESSIBILITY_SAVE_SUCCESS ? (
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "13px",
                  fontWeight: 500,
                  lineHeight: 1.45,
                  color: "rgb(251 191 36)",
                }}
              >
                {accessibilityMessage}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSaveAccessibility()}
              disabled={accessibilitySaving}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "none",
                background: accessibilitySaving ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: accessibilitySaving ? "wait" : "pointer",
                transition: "transform 0.15s ease, opacity 0.15s ease",
              }}
            >
              {accessibilitySaving
                ? t("loading")
                : accessibilityMessage === ACCESSIBILITY_SAVE_SUCCESS
                  ? t("saved_check")
                  : t("save_preferences")}
            </button>
          </div>

          {/* Disabled temporarily: active meeting mode caused profile reload loop — whole "Mode rencontre active" card (title, description, toggle, countdown, error). */}

          {user?.id ? (
            <MeetingAgeRangePreferencesPanel
              userId={user.id}
              revisionKey={meetingAgePrefsRevisionKey}
              preferredMinResolved={preferredMeetingAgeBounds.min}
              preferredMaxResolved={preferredMeetingAgeBounds.max}
              onAfterSuccessfulSave={async (min, max) => {
                if (profile) {
                  commitProfileRow({
                    ...profile,
                    preferred_age_min: min,
                    preferred_age_max: max,
                  });
                }
                await refetchProfile();
                await syncProfileForScreen();
                redirectToMoveAfterSave();
              }}
            />
          ) : null}

          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "20px 24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "16px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("location")}
            </h2>
            <p
              style={{
                margin: "0 0 14px 0",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {t("location_profile_hint")}
            </p>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("city")}
            </label>
            <input
              ref={locCityInputRef}
              type="text"
              value={locCity}
              onChange={(e) => {
                setLocCity(e.target.value);
                setLocMessage(null);
              }}
              placeholder={t("city_example")}
              autoComplete="address-level2"
              style={{
                width: "100%",
                marginBottom: "14px",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                background: APP_BG,
                fontSize: "15px",
                color: APP_TEXT,
                boxSizing: "border-box",
              }}
            />
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("search_radius_km")}
            </label>
            <select
              ref={locRadiusSelectRef}
              value={locRadius}
              onChange={(e) => {
                setLocRadius(e.target.value);
                setLocMessage(null);
              }}
              style={{
                width: "100%",
                marginBottom: "14px",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                background: APP_BG,
                fontSize: "15px",
                color: APP_TEXT,
                boxSizing: "border-box",
              }}
            >
              <option value="10">{t("distance_10_km")}</option>
              <option value="25">{t("distance_25_km")}</option>
              <option value="50">{t("distance_50_km")}</option>
              <option value="100">{t("distance_100_km")}</option>
            </select>
            <button
              type="button"
              disabled={geoLoading}
              onClick={() => void handleUseMyLocation()}
              style={{
                width: "100%",
                marginBottom: "10px",
                padding: "10px 14px",
                borderRadius: "12px",
                border: `1px solid #2A2A2E`,
                background: APP_BG,
                color: APP_TEXT,
                fontSize: "14px",
                fontWeight: 600,
                cursor: geoLoading ? "wait" : "pointer",
              }}
            >
              {geoLoading ? t("loading") : t("use_current_location")}
            </button>
            <button
              type="button"
              disabled={locSaving}
              onClick={() => void handleSaveLocation()}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "none",
                background: locSaving ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: locSaving ? "wait" : "pointer",
              }}
            >
              {locSaving ? t("loading") : t("save_location")}
            </button>
            {locMessage ? (
              <p
                style={{
                  margin: "12px 0 0 0",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: locMessage.includes("Enregistr") ? "rgb(52 211 153)" : APP_TEXT_MUTED,
                  lineHeight: 1.45,
                }}
              >
                {locMessage}
              </p>
            ) : null}
          </div>

          {growth?.referral_code ? (
            <div
              id="growth_invite"
              style={{
                background: APP_CARD,
                borderRadius: "20px",
                padding: "20px 24px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                marginBottom: "20px",
                border: `1px solid ${APP_BORDER}`,
              }}
            >
              <h2
                style={{
                  margin: "0 0 6px 0",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: APP_TEXT,
                }}
              >
                {t("growth_invite_title")}
              </h2>
              <p
                style={{
                  margin: "0 0 14px 0",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: APP_TEXT_MUTED,
                  lineHeight: 1.45,
                }}
              >
                {t("growth_invite_sub")}
              </p>
              <p style={{ margin: "0 0 4px 0", fontSize: "12px", fontWeight: 600, color: APP_TEXT_MUTED }}>
                {t("growth_your_code")}
              </p>
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: APP_TEXT,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {growth.referral_code}
              </p>
              {typeof growth.rewind_credits === "number" ? (
                <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: APP_TEXT_MUTED }}>
                  {t("growth_rewinds")}: {growth.rewind_credits}
                </p>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  if (!growth.referral_code) return;
                  const link = buildAuthReferralLink(growth.referral_code);
                  try {
                    await navigator.clipboard.writeText(link);
                    setGrowthLinkCopied(true);
                    window.setTimeout(() => setGrowthLinkCopied(false), 2000);
                  } catch {
                    setGrowthLinkCopied(false);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "none",
                  background: growthLinkCopied ? CTA_DISABLED_BG : BRAND_BG,
                  color: TEXT_ON_BRAND,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {growthLinkCopied ? t("rl_session_link_copied") : t("growth_copy_link")}
              </button>
            </div>
          ) : null}

          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "20px 24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "16px",
                fontWeight: 600,
                color: APP_TEXT,
              }}
            >
              {t("security")}
            </h2>
            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {t("security_intro")}
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.55,
              }}
            >
              <li style={{ marginBottom: "6px" }}>{t("report_behavior")}</li>
              <li>{t("hide_user")}</li>
            </ul>
            <button
              type="button"
              onClick={() => navigate("/account-settings")}
              style={{
                marginTop: "16px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "none",
                background: BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("manage_account")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "11px 14px",
              borderRadius: "12px",
              border: "1px solid #2A2A2E",
              background: "transparent",
              color: APP_TEXT_MUTED,
              fontSize: "14px",
              fontWeight: 500,
              cursor: isSigningOut ? "not-allowed" : "pointer",
              opacity: isSigningOut ? 0.6 : 1,
            }}
          >
            <IconSignOut size={18} color="currentColor" />
            {isSigningOut
              ? language === "en"
                ? "Signing out…"
                : "Déconnexion…"
              : t("logout")}
          </button>
          <div
            style={{
              marginTop: "12px",
              background: APP_CARD,
              borderRadius: "14px",
              padding: "14px",
              border: `1px solid ${APP_BORDER}`,
            }}
          >
            <p style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: 600, color: APP_TEXT_MUTED }}>
              {t("language")}
            </p>
            <LanguageSwitcher />
          </div>
          </>
        )}
      </main>
      {selectedPhotoUrl ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/80"
          onClick={() => setSelectedPhotoUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-[60] flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/20 bg-black/60 text-[28px] font-light leading-none text-white shadow-lg hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label={t("close")}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhotoUrl(null);
            }}
          >
            ×
          </button>
          <div className="pointer-events-none flex h-full w-full touch-manipulation items-center justify-center p-4">
            <div
              className="pointer-events-auto"
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedPhotoUrl}
                alt=""
                className="max-h-[85vh] max-w-[95vw] object-contain shadow-2xl"
                onLoad={profileFullscreenImgHandlers.onLoad}
                onError={profileFullscreenImgHandlers.onError}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
