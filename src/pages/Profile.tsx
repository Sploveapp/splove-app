import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  ACCESSIBILITY_PREF_ADAPTED_LABEL,
  ACCESSIBILITY_PREF_BOTH_REQUIRED,
  ACCESSIBILITY_PREF_STANDARD_LABEL,
  ACCESSIBILITY_SECTION_INTRO,
  ACCESSIBILITY_SELF_LABEL,
  PROFILE_SAFETY_HINT,
  VERIFY_OWN_NOT_VERIFIED,
  VERIFY_OWN_PENDING,
  VERIFY_OWN_VERIFIED,
} from "../constants/copy";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { collectPhotoRejectionUserMessages, isPhotoVerified } from "../lib/profileVerification";
import {
  APP_BG,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import { supabase } from "../lib/supabase";
import { IconSignOut } from "../components/ui/Icon";

const FEATURE_COMING_SOON_MESSAGE = "Fonction bientôt disponible";

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
import {
  MESSAGE_BUBBLE_THEME_IDS,
  MESSAGE_BUBBLE_THEME_LABELS,
  OWN_MESSAGE_BUBBLE_CLASSES,
  loadMessageBubbleThemeFromStorage,
  saveMessageBubbleThemeToStorage,
  type MessageBubbleTheme,
} from "../lib/messageBubbleTheme";

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile, refetchProfile } = useAuth();
  const mainPhoto = profile?.main_photo_url?.trim() || null;
  const [imageError, setImageError] = useState(false);
  const [bubbleTheme, setBubbleTheme] = useState<MessageBubbleTheme>(() =>
    loadMessageBubbleThemeFromStorage(),
  );
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [needsAdaptedActivities, setNeedsAdaptedActivities] = useState(false);
  const [prefOpenToStandard, setPrefOpenToStandard] = useState(true);
  const [prefOpenToAdapted, setPrefOpenToAdapted] = useState(true);
  const [accessibilitySaving, setAccessibilitySaving] = useState(false);
  const [accessibilityMessage, setAccessibilityMessage] = useState<string | null>(null);

  const syncAccessibilityFromProfile = useCallback(() => {
    if (!profile) return;
    setNeedsAdaptedActivities(!!profile.needs_adapted_activities);
    setPrefOpenToStandard(profile.pref_open_to_standard_activity !== false);
    setPrefOpenToAdapted(profile.pref_open_to_adapted_activity !== false);
  }, [profile]);

  useEffect(() => {
    syncAccessibilityFromProfile();
  }, [syncAccessibilityFromProfile]);

  useEffect(() => {
    const onStorage = () => setBubbleTheme(loadMessageBubbleThemeFromStorage());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!comingSoonOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComingSoonOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comingSoonOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
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
      setAccessibilityMessage("Préférences enregistrées.");
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
          Mon profil
        </h1>

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
                  <div style={{ marginBottom: "10px" }}>
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
                    const s = (profile?.photo_verification_status ?? "").toLowerCase();
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
                            Tes photos n’ont pas été validées. Tu peux en envoyer de nouvelles conformes aux
                            consignes (visage + silhouette, images personnelles).
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
              Apparence du chat
            </h2>
            <p
              style={{
                margin: "0 0 18px 0",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
              }}
            >
              Couleur de mes bulles — appliquée à tous vos messages envoyés. Les messages reçus restent neutres.
            </p>
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              role="radiogroup"
              aria-label="Couleur de mes bulles de message"
            >
              {MESSAGE_BUBBLE_THEME_IDS.map((id) => {
                const selected = bubbleTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      saveMessageBubbleThemeToStorage(id);
                      setBubbleTheme(id);
                    }}
                    className={`flex flex-col items-stretch gap-2 rounded-xl border p-3 text-center transition ${
                      selected
                        ? "border-app-accent/40 bg-app-bg/95 ring-2 ring-app-accent/20"
                        : "border-app-border/95 bg-app-card hover:bg-app-border/90"
                    }`}
                  >
                    <div
                      className={`rounded-2xl border px-3 py-2 text-left text-[13px] leading-snug shadow-sm ${OWN_MESSAGE_BUBBLE_CLASSES[id]}`}
                    >
                      Bonjour !
                    </div>
                    <span className="text-center text-[12px] font-semibold text-app-text">
                      {MESSAGE_BUBBLE_THEME_LABELS[id]}
                    </span>
                  </button>
                );
              })}
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
              Rencontres & activités
            </h2>
            <p
              style={{
                margin: "0 0 14px 0",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
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
              Qui souhaitez-vous rencontrer ?
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
            {accessibilityMessage ? (
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: accessibilityMessage.includes("Enregistré")
                    ? "rgb(52 211 153)"
                    : "rgb(251 191 36)",
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
              }}
            >
              {accessibilitySaving ? "Enregistrement…" : "Enregistrer ces préférences"}
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
              Sécurité
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
              }}
            >
              {PROFILE_SAFETY_HINT}
            </p>
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
