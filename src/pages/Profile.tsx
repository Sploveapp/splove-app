import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  ACCESSIBILITY_PREF_BOTH_REQUIRED,
  VERIFY_OWN_NOT_VERIFIED,
  VERIFY_OWN_VERIFIED,
} from "../constants/copy";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { collectPhotoRejectionUserMessages, isPhotoVerified } from "../lib/profileVerification";
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

const FEATURE_COMING_SOON_MESSAGE = "Fonction bientot disponible";

const SPORT_PHRASE_MAX_LEN = 120;

const MEETUP_HOUR_MS = 60 * 60 * 1000;
const MEETUP_DURATION_H = 24;
const MEETUP_GREEN = "#22C55D";
const MEETUP_CARD_BG = "#121215";
const MEETUP_CARD_BORDER_ACTIVE = "rgba(34, 197, 94, 0.42)";

const ACCESSIBILITY_SAVE_SUCCESS = "Preferences enregistrees.";

type MeetupModeSession = { endAt: number; startTime: number; durationH: number };

function meetupStorageKeys(userId: string) {
  return {
    mode: `splove_${userId}_active_meetup_mode`,
    start: `splove_${userId}_active_meetup_start_time`,
    duration: `splove_${userId}_active_meetup_duration`,
  } as const;
}

function clearMeetupModeStorage(userId: string) {
  const k = meetupStorageKeys(userId);
  try {
    localStorage.removeItem(k.mode);
    localStorage.removeItem(k.start);
    localStorage.removeItem(k.duration);
  } catch {
    // ignore
  }
}

function readMeetupModeSession(userId: string, clearIfExpired: boolean): MeetupModeSession | null {
  const k = meetupStorageKeys(userId);
  let mode: string | null;
  let startS: string | null;
  let durationS: string | null;
  try {
    mode = localStorage.getItem(k.mode);
    startS = localStorage.getItem(k.start);
    durationS = localStorage.getItem(k.duration);
  } catch {
    return null;
  }
  if (mode !== "true" || !startS || !durationS) return null;
  const start = parseInt(startS, 10);
  const durationH = parseInt(durationS, 10);
  if (!Number.isFinite(start) || !Number.isFinite(durationH) || durationH <= 0) {
    if (clearIfExpired) clearMeetupModeStorage(userId);
    return null;
  }
  const endAt = start + durationH * MEETUP_HOUR_MS;
  if (Date.now() >= endAt) {
    if (clearIfExpired) clearMeetupModeStorage(userId);
    return null;
  }
  return { endAt, startTime: start, durationH };
}

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
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
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
  const [meetupModeTick, setMeetupModeTick] = useState(0);
  const [meetupModeError, setMeetupModeError] = useState<string | null>(null);

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
    if (!comingSoonOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComingSoonOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comingSoonOpen]);

  useEffect(() => {
    if (accessibilityMessage !== ACCESSIBILITY_SAVE_SUCCESS) return;
    const t = window.setTimeout(() => setAccessibilityMessage(null), 1500);
    return () => window.clearTimeout(t);
  }, [accessibilityMessage]);

  useEffect(() => {
    if (phraseMessage !== "Phrase enregistrée.") return;
    const t = window.setTimeout(() => setPhraseMessage(null), 2000);
    return () => window.clearTimeout(t);
  }, [phraseMessage]);

  useEffect(() => {
    if (!user?.id) return;
    const id = window.setInterval(() => setMeetupModeTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchGrowthProfileFields(user.id).then(setGrowth);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !profile) return;
    const session = readMeetupModeSession(user.id, true);
    const pr = profile as Record<string, unknown>;
    const dbActive = pr.is_active_mode === true;
    if (session && !dbActive) {
      void supabase
        .from("profiles")
        .update({ is_active_mode: true })
        .eq("id", user.id)
        .then(({ error }) => {
          if (!error) void refetchProfile();
        });
    } else if (!session && dbActive) {
      void supabase
        .from("profiles")
        .update({ is_active_mode: false })
        .eq("id", user.id)
        .then(({ error }) => {
          if (!error) void refetchProfile();
        });
    }
  }, [user?.id, profile, meetupModeTick, refetchProfile]);

  async function handleMeetupModeCardClick() {
    if (!user?.id) return;
    setMeetupModeError(null);
    const session = readMeetupModeSession(user.id, true);
    if (session) {
      clearMeetupModeStorage(user.id);
      setMeetupModeTick((n) => n + 1);
      const { error } = await supabase
        .from("profiles")
        .update({ is_active_mode: false })
        .eq("id", user.id);
      if (error) {
        setMeetupModeError(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      return;
    }
    const k = meetupStorageKeys(user.id);
    const now = Date.now();
    try {
      localStorage.setItem(k.mode, "true");
      localStorage.setItem(k.start, now.toString());
      localStorage.setItem(k.duration, String(MEETUP_DURATION_H));
    } catch {
      setMeetupModeError(t("action_impossible"));
      return;
    }
    setMeetupModeTick((n) => n + 1);
    const { error } = await supabase
      .from("profiles")
      .update({ is_active_mode: true })
      .eq("id", user.id);
    if (error) {
      clearMeetupModeStorage(user.id);
      setMeetupModeTick((n) => n + 1);
      setMeetupModeError(error.message || t("action_impossible"));
      return;
    }
    await refetchProfile();
  }

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
      setPhraseMessage("Phrase enregistree.");
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
        location_source: "manual",
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
        location_source: "device",
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

  const meetupSession = user?.id ? readMeetupModeSession(user.id, true) : null;
  const meetupModeOn = meetupSession !== null;
  const meetupRemainingMs = meetupSession ? Math.max(0, meetupSession.endAt - Date.now()) : 0;
  const meetupHoursLeft = Math.floor(meetupRemainingMs / MEETUP_HOUR_MS);

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
            <button
              type="button"
              style={sectionHeadingButtonStyle}
              onClick={() => setComingSoonOpen(true)}
              aria-haspopup="dialog"
            >
              {t("photos.primary")}
            </button>
            {mainPhoto && !imageError ? (
              <button
                type="button"
                onClick={() => setComingSoonOpen(true)}
                aria-label={`${FEATURE_COMING_SOON_MESSAGE}. ${t("photos.primary")}.`}
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
                      console.log("PROFILE IMAGE LOADED", mainPhoto);
                    }}
                    onError={() => {
                      console.error("PROFILE IMAGE ERROR", mainPhoto);
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
              <button
                type="button"
                onClick={() => setComingSoonOpen(true)}
                style={{
                  margin: "0 0 16px 0",
                  padding: 0,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
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
              </button>
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
              {profile && isPhotoVerified(profile) ? (
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
                    {VERIFY_OWN_VERIFIED}
                  </p>
                </>
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
                        {VERIFY_OWN_NOT_VERIFIED}
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
              <p style={{ margin: "10px 0 0 0", fontSize: "14px", color: APP_TEXT_MUTED }}>{phraseMessage}</p>
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

          <div
            style={{
              background: APP_CARD,
              borderRadius: "20px",
              padding: "20px 24px 22px",
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
              {t("profile_active_mode_title")}
            </h2>
            <p
              style={{
                margin: "0 0 16px 0",
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {t("profile_active_mode_description")}
            </p>
            <button
              type="button"
              onClick={() => void handleMeetupModeCardClick()}
              aria-pressed={meetupModeOn}
              style={{
                width: "100%",
                margin: 0,
                padding: "16px 16px 14px",
                borderRadius: "16px",
                border: `1px solid ${meetupModeOn ? MEETUP_CARD_BORDER_ACTIVE : APP_BORDER}`,
                background: MEETUP_CARD_BG,
                boxShadow: meetupModeOn
                  ? "0 0 0 1px rgba(34, 197, 94, 0.12), 0 10px 40px rgba(34, 197, 94, 0.14)"
                  : "0 1px 0 rgba(0,0,0,0.2)",
                cursor: "pointer",
                textAlign: "left",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: meetupModeOn ? MEETUP_GREEN : APP_TEXT,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {meetupModeOn ? t("profile_active_mode_cta_on") : t("profile_active_mode_cta_off")}
                  </p>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: 52,
                    height: 30,
                    borderRadius: 999,
                    background: meetupModeOn ? "rgba(34, 197, 94, 0.28)" : "rgba(255,255,255,0.1)",
                    border: `1px solid ${meetupModeOn ? "rgba(34, 197, 94, 0.55)" : APP_BORDER}`,
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: meetupModeOn ? 24 : 3,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: meetupModeOn ? MEETUP_GREEN : "rgba(255,255,255,0.65)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                      transition: "left 0.18s ease",
                    }}
                  />
                </div>
              </div>
              {meetupModeOn ? (
                <>
                  <p
                    style={{
                      margin: "12px 0 0 0",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: APP_TEXT_MUTED,
                      lineHeight: 1.45,
                    }}
                  >
                    {t("profile_active_mode_on_hint")}
                  </p>
                  <p
                    style={{
                      margin: "8px 0 0 0",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: MEETUP_GREEN,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {meetupHoursLeft >= 1
                      ? t("profile_active_mode_countdown", { hours: meetupHoursLeft })
                      : t("profile_active_mode_countdown_soon")}
                  </p>
                </>
              ) : null}
            </button>
            {meetupModeError ? (
              <p style={{ margin: "10px 0 0 0", fontSize: "13px", color: "rgb(251 191 36)" }}>{meetupModeError}</p>
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
      {comingSoonOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setComingSoonOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-coming-soon-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "340px",
              borderRadius: "20px",
              background: APP_CARD,
              padding: "24px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2
              id="profile-coming-soon-title"
              style={{
                margin: "0 0 10px 0",
                fontSize: "18px",
                fontWeight: 700,
                color: APP_TEXT,
                lineHeight: 1.3,
              }}
            >
              {FEATURE_COMING_SOON_MESSAGE}
            </h2>
            <p
              style={{
                margin: "0 0 20px 0",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
              }}
            >
              {t("profile_coming_soon_desc")}
            </p>
            <button
              type="button"
              onClick={() => setComingSoonOpen(false)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "none",
                background: BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("ok")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
