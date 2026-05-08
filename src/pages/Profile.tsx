import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
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
import { reverseGeocodeCity } from "../lib/geocoding";
import { updateProfileLocation } from "../lib/profileLocation";
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
import { CHAT_BUBBLE_COLOR_ORDER, CHAT_BUBBLE_COLORS } from "../constants/chatBubbleColors";
import { getOwnMessageBubbleClassName } from "../lib/messageBubbleTheme";
import { useTranslation } from "../i18n/useTranslation";
import { buildAuthReferralLink, fetchGrowthProfileFields, type GrowthProfileRow } from "../services/referral.service";
import { useProfilePhotoSignedUrl } from "../hooks/useProfilePhotoSignedUrl";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, refetchProfile, signOut } = useAuth();
  const mainPhoto = profile?.main_photo_url?.trim() || null;
  const mainPhotoDisplay = useProfilePhotoSignedUrl(mainPhoto) ?? null;
  const [imageError, setImageError] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
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
  const failedProfileImageSourcesRef = useRef<Set<string>>(new Set());
  const profileImageFailureCountRef = useRef(0);

  const syncAccessibilityFromProfile = useCallback(() => {
    if (!profile) return;
    setNeedsAdaptedActivities(!!profile.needs_adapted_activities);
    setPrefOpenToStandard(true);
    setPrefOpenToAdapted(true);
  }, [profile]);

  useEffect(() => {
    syncAccessibilityFromProfile();
  }, [syncAccessibilityFromProfile]);

  useEffect(() => {
    if (!profile) return;
    const pr = profile as Record<string, unknown>;
    setPhraseDraft(typeof pr.sport_phrase === "string" ? pr.sport_phrase : "");
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const pr = profile as Record<string, unknown>;
    setLocCity(typeof pr.city === "string" ? pr.city : "");
    const dr = pr.discovery_radius_km;
    if (typeof dr === "number" && Number.isFinite(dr) && dr > 0) {
      setLocRadius(String(Math.round(dr)));
    } else {
      setLocRadius("");
    }
  }, [profile]);

  useEffect(() => {
    if (!selectedPhotoUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPhotoUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPhotoUrl]);

  useEffect(() => {
    failedProfileImageSourcesRef.current.clear();
    profileImageFailureCountRef.current = 0;
    setImageError(false);
  }, [mainPhoto]);

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
    await signOut();
  }

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
      setPhraseMessage(SPORT_PHRASE_SAVED_FLAG);
    } finally {
      setPhraseSaving(false);
    }
  }

  async function handleSaveLocation() {
    if (!user?.id || !profile) return;
    setLocMessage(null);
    setLocSaving(true);
    try {
      const radiusParsed = locRadius === "" ? null : Number(locRadius);
      const radiusFinal =
        radiusParsed != null && Number.isFinite(radiusParsed) && radiusParsed > 0
          ? Math.round(radiusParsed)
          : 25;
      const pr = profile as Record<string, unknown>;
      const lat = typeof pr.latitude === "number" && Number.isFinite(pr.latitude) ? pr.latitude : null;
      const lng = typeof pr.longitude === "number" && Number.isFinite(pr.longitude) ? pr.longitude : null;
      const { error } = await updateProfileLocation(supabase, user.id, {
        city: locCity.trim() || null,
        latitude: lat,
        longitude: lng,
        discovery_radius_km: radiusFinal,
      });
      if (error) {
        setLocMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      setLocMessage("Localisation enregistree.");
    } finally {
      setLocSaving(false);
    }
  }

  async function handleUseMyLocation() {
    if (!user?.id || !profile) return;
    setLocMessage(null);
    setGeoLoading(true);
    try {
      const c = await getCurrentPositionCoords();
      if (!c) {
        setLocMessage("Position indisponible. Verifie les autorisations ou saisis ta ville.");
        return;
      }
      const radiusParsed = locRadius === "" ? null : Number(locRadius);
      const radiusFinal =
        radiusParsed != null && Number.isFinite(radiusParsed) && radiusParsed > 0
          ? Math.round(radiusParsed)
          : 25;
      const cityLabel = await reverseGeocodeCity(c.lat, c.lng);
      const { error } = await updateProfileLocation(supabase, user.id, {
        city: (cityLabel ?? locCity.trim()) || null,
        latitude: c.lat,
        longitude: c.lng,
        discovery_radius_km: radiusFinal,
      });
      if (error) {
        setLocMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      setLocMessage("Position enregistree.");
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
      setAccessibilityMessage(ACCESSIBILITY_SAVE_SUCCESS);
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
          maxWidth: "420px",
          margin: "0 auto",
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
          }}
        >
          {t("my_meetups")}
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
            {mainPhoto && !imageError ? (
              <button
                type="button"
                onClick={() => {
                  if (mainPhotoDisplay) setSelectedPhotoUrl(mainPhotoDisplay);
                }}
                aria-label={t("view_photo")}
                style={{
                  marginBottom: "16px",
                  padding: 0,
                  border: "none",
                  borderRadius: "16px",
                  overflow: "hidden",
                  maxWidth: "220px",
                  cursor: "pointer",
                  display: "block",
                  background: "none",
                }}
              >
                {mainPhotoDisplay ? (
                  <img
                    src={mainPhotoDisplay}
                    alt="Votre photo de profil — appuyez pour les options"
                    onLoad={() => {
                      if (import.meta.env.DEV) {
                        console.log("[Profile image debug] image source URL", {
                          raw: mainPhoto,
                          src: mainPhotoDisplay,
                          status: "loaded",
                        });
                      }
                    }}
                    onError={() => {
                      const src = mainPhotoDisplay || "";
                      if (failedProfileImageSourcesRef.current.has(src)) {
                        if (import.meta.env.DEV) {
                          console.warn("[Profile image debug] retry skipped reason", {
                            raw: mainPhoto,
                            src,
                            reason: "already failed in current render cycle",
                          });
                        }
                        return;
                      }
                      failedProfileImageSourcesRef.current.add(src);
                      profileImageFailureCountRef.current += 1;
                      if (import.meta.env.DEV) {
                        console.warn("[Profile image debug] image source URL", {
                          raw: mainPhoto,
                          src,
                          status: "failed",
                        });
                        console.warn("[Profile image debug] image load failure count", {
                          count: profileImageFailureCountRef.current,
                        });
                      }
                      setImageError(true);
                    }}
                    style={{
                      width: "100%",
                      aspectRatio: "3 / 4",
                      objectFit: "cover",
                      display: "block",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "3 / 4",
                      background: APP_BG,
                      border: `1px solid ${APP_BORDER}`,
                      display: "block",
                    }}
                  />
                )}
              </button>
            ) : (
              <p
                style={{
                  margin: "0 0 16px 0",
                  padding: 0,
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: "14px",
                  color: APP_TEXT_MUTED,
                }}
              >
                {mainPhoto && imageError
                  ? "La photo principale existe mais ne peut pas être chargée."
                  : "Aucune photo principale enregistrée."}
              </p>
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
              {t("profile_message_color_title")}
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
              {t("profile_message_color_desc_prefix")}{" "}
              <strong style={{ color: APP_TEXT, fontWeight: 600 }}>{t("profile_message_color_desc_strong")}</strong>{" "}
              {t("profile_message_color_desc_suffix")}
            </p>
            <p style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 500, color: APP_TEXT_MUTED }}>
              <Link
                to="/messages"
                style={{ color: BRAND_BG, fontWeight: 600, textDecoration: "underline" }}
              >
                {t("profile_open_messages")}
              </Link>
            </p>
            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "12px",
                fontWeight: 600,
                color: APP_TEXT_MUTED,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}
            >
              {t("profile_message_style_preview")}
            </p>
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              aria-hidden="true"
            >
              {CHAT_BUBBLE_COLOR_ORDER.map((id) => (
                <div
                  key={id}
                  className="flex flex-col items-stretch gap-2 rounded-xl border border-app-border/95 bg-app-card p-3 text-center"
                >
                  <div className="flex w-full min-w-0 justify-end">
                    <div className={getOwnMessageBubbleClassName(id)}>{t("profile_message_preview_text")}</div>
                  </div>
                  <span className="text-center text-[12px] font-semibold text-app-text">
                    {t(CHAT_BUBBLE_COLORS[id].label)}
                  </span>
                </div>
              ))}
            </div>
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
              <option value="">{t("no_distance_limit")}</option>
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
              cursor: "pointer",
            }}
          >
            <IconSignOut size={18} color="currentColor" />
            {t("logout")}
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
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
