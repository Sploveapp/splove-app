import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  ACCESSIBILITY_PREF_ADAPTED_LABEL,
  ACCESSIBILITY_PREF_BOTH_REQUIRED,
  ACCESSIBILITY_PREF_STANDARD_LABEL,
  ACCESSIBILITY_SECTION_INTRO,
  ACCESSIBILITY_SELF_LABEL,
  VERIFY_OWN_NOT_VERIFIED,
  VERIFY_OWN_PENDING,
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

const FEATURE_COMING_SOON_MESSAGE = "Fonction bientôt disponible";

const SPORT_PHRASE_MAX_LEN = 120;

const ACCESSIBILITY_SAVE_SUCCESS = "Préférences enregistrées.";

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

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile, refetchProfile } = useAuth();
  const mainPhoto = profile?.main_photo_url?.trim() || null;
  const [imageError, setImageError] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
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
  const [isActiveMode, setIsActiveMode] = useState(false);
  const [activeModeSaving, setActiveModeSaving] = useState(false);
  const [activeModeMessage, setActiveModeMessage] = useState<string | null>(null);

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
    setIsActiveMode(pr.is_active_mode === true);
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

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }

  async function handleSaveSportPhrase() {
    if (!user?.id) return;
    const t = phraseDraft.trim();
    if (t.length > 0 && bioPublicTextViolatesPolicy(t)) {
      setPhraseMessage("Ce texte n’est pas autorisé (liens, réseaux sociaux, etc.).");
      return;
    }
    setPhraseSaving(true);
    setPhraseMessage(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          sport_phrase: t.length > 0 ? t.slice(0, SPORT_PHRASE_MAX_LEN) : null,
        })
        .eq("id", user.id);
      if (error) {
        setPhraseMessage(error.message || "Enregistrement impossible.");
        return;
      }
      await refetchProfile();
      setPhraseMessage("Phrase enregistrée.");
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
        setLocMessage(error.message || "Enregistrement impossible.");
        return;
      }
      await refetchProfile();
      setLocMessage("Localisation enregistrée.");
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
        setLocMessage("Position indisponible. Vérifie les autorisations ou saisis ta ville.");
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
        setLocMessage(error.message || "Enregistrement impossible.");
        return;
      }
      await refetchProfile();
      setLocMessage("Position enregistrée.");
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
        setAccessibilityMessage(error.message || "Enregistrement impossible.");
        return;
      }
      await refetchProfile();
      setAccessibilityMessage(ACCESSIBILITY_SAVE_SUCCESS);
    } finally {
      setAccessibilitySaving(false);
    }
  }

  async function handleSaveActiveMode() {
    if (!user?.id) return;
    setActiveModeMessage(null);
    setActiveModeSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active_mode: isActiveMode })
        .eq("id", user.id);
      if (error) {
        console.error("[Profile] active mode save error:", error);
        setActiveModeMessage(error.message || "Enregistrement impossible.");
        return;
      }
      await refetchProfile();
      setActiveModeMessage("Mode rencontre active enregistré.");
    } catch (err) {
      console.error("[Profile] active mode save failed:", err);
      setActiveModeMessage("Enregistrement impossible.");
    } finally {
      setActiveModeSaving(false);
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
          Mon profil
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
          Mes rencontres
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
          Modifier mon profil
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
              Photo principale
            </button>
            {mainPhoto && !imageError ? (
              <button
                type="button"
                onClick={() => setComingSoonOpen(true)}
                aria-label={`${FEATURE_COMING_SOON_MESSAGE}. Photo principale.`}
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
                <img
                  src={mainPhoto}
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
                Vérification du profil
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
                          {VERIFY_OWN_PENDING}
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
              Phrase sport (optionnel)
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
              Une courte phrase sur ton énergie ou ton style — tu peux la laisser vide.
            </p>
            <textarea
              value={phraseDraft}
              onChange={(e) => {
                setPhraseDraft(e.target.value.slice(0, SPORT_PHRASE_MAX_LEN));
                setPhraseMessage(null);
              }}
              rows={3}
              maxLength={SPORT_PHRASE_MAX_LEN}
              placeholder="Ex. Trail le dimanche, j’aime le rythme et l’air large."
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
              {phraseSaving ? "Enregistrement…" : "Enregistrer la phrase"}
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
              Couleur de tes messages
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
              Le style des bulles se choisit{" "}
              <strong style={{ color: APP_TEXT, fontWeight: 600 }}>dans chaque conversation</strong>{" "}
              : menu <span aria-hidden="true">⋮</span> en haut à droite, puis « Style de discussion ». Ce
              n’est pas un réglage global du profil.
            </p>
            <p style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 500, color: APP_TEXT_MUTED }}>
              <Link
                to="/messages"
                style={{ color: BRAND_BG, fontWeight: 600, textDecoration: "underline" }}
              >
                Ouvrir Mes messages
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
              Aperçu des styles (non appliqué ici)
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
                    <div className={getOwnMessageBubbleClassName(id)}>Bonjour !</div>
                  </div>
                  <span className="text-center text-[12px] font-semibold text-app-text">
                    {CHAT_BUBBLE_COLORS[id].label}
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
              Tes rencontres
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
              {ACCESSIBILITY_SECTION_INTRO}
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
              <span>{ACCESSIBILITY_SELF_LABEL}</span>
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
              Qui t’intéresse ?
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
              <span>{ACCESSIBILITY_PREF_STANDARD_LABEL}</span>
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
              <span>{ACCESSIBILITY_PREF_ADAPTED_LABEL}</span>
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
                ? "Enregistrement…"
                : accessibilityMessage === ACCESSIBILITY_SAVE_SUCCESS
                  ? "✓ Enregistré"
                  : "Enregistrer ces préférences"}
            </button>
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
              Mode rencontre active
            </h2>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
                fontSize: "14px",
                color: APP_TEXT_MUTED,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isActiveMode}
                onChange={(e) => {
                  setIsActiveMode(e.target.checked);
                  setActiveModeMessage(null);
                }}
                style={{ width: "16px", height: "16px" }}
              />
              <span>Mode rencontre active</span>
            </label>
            <button
              type="button"
              onClick={() => void handleSaveActiveMode()}
              disabled={activeModeSaving}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "none",
                background: activeModeSaving ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: activeModeSaving ? "wait" : "pointer",
              }}
            >
              {activeModeSaving ? "Enregistrement…" : "Enregistrer ce mode"}
            </button>
            {activeModeMessage ? (
              <p style={{ margin: "10px 0 0 0", fontSize: "13px", color: APP_TEXT_MUTED }}>
                {activeModeMessage}
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
              Localisation
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
              Utilisée pour te montrer des profils à proximité sur Discover. Approximatif, sans carte.
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
              Ville
            </label>
            <input
              type="text"
              value={locCity}
              onChange={(e) => {
                setLocCity(e.target.value);
                setLocMessage(null);
              }}
              placeholder="ex. Lyon"
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
              Rayon de recherche (km)
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
              <option value="">Pas de limite de distance</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
              <option value="100">100 km</option>
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
              {geoLoading ? "Localisation…" : "Utiliser ma position actuelle"}
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
              {locSaving ? "Enregistrement…" : "Enregistrer la localisation"}
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
              Sécurité
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
              Sur un profil ou dans un chat, le menu ⋯ te permet d’agir.
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
              <li style={{ marginBottom: "6px" }}>Signaler un comportement</li>
              <li>Ne plus voir quelqu’un</li>
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
              Gérer mon compte
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
            Se déconnecter
          </button>
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
              Cette partie du profil arrive très bientôt. Merci de votre patience.
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
              D’accord
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
