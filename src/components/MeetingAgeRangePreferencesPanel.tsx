import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_PREFERRED_AGE_MAX,
  DEFAULT_PREFERRED_AGE_MIN,
  normalizePreferredAgeRange,
  PROFILE_MIN_VISIBLE_AGE,
} from "../lib/profileAge";
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
import { useTranslation } from "../i18n/useTranslation";

const SAVE_OK = "__meet_age_prefs_ok__";

export type MeetingAgeRangePreferencesPanelProps = {
  userId: string;
  revisionKey?: string;
  preferredMinResolved: number;
  preferredMaxResolved: number;
  onAfterSuccessfulSave?: () => void | Promise<unknown>;
};

/**
 * Section « préférences de rencontre » privées (âge) — même logique métier onboarding / Discover.
 */
export function MeetingAgeRangePreferencesPanel(props: MeetingAgeRangePreferencesPanelProps) {
  const { t } = useTranslation();
  const { userId, revisionKey = "", preferredMinResolved, preferredMaxResolved, onAfterSuccessfulSave } = props;

  const [prefAgeMinStr, setPrefAgeMinStr] = useState(String(DEFAULT_PREFERRED_AGE_MIN));
  const [prefAgeMaxStr, setPrefAgeMaxStr] = useState(String(DEFAULT_PREFERRED_AGE_MAX));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const norm = normalizePreferredAgeRange(preferredMinResolved, preferredMaxResolved);
    setPrefAgeMinStr(String(norm.min));
    setPrefAgeMaxStr(String(norm.max));
  }, [
    revisionKey,
    preferredMinResolved,
    preferredMaxResolved,
    userId,
  ]);

  useEffect(() => {
    if (message !== SAVE_OK) return;
    const tmr = window.setTimeout(() => setMessage(null), 2200);
    return () => window.clearTimeout(tmr);
  }, [message]);

  async function handleSave() {
    const aminRaw = Number.parseInt(prefAgeMinStr.trim(), 10);
    const amaxRaw = Number.parseInt(prefAgeMaxStr.trim(), 10);
    if (
      !Number.isFinite(aminRaw) ||
      !Number.isFinite(amaxRaw) ||
      aminRaw < PROFILE_MIN_VISIBLE_AGE ||
      amaxRaw < PROFILE_MIN_VISIBLE_AGE ||
      aminRaw > amaxRaw
    ) {
      setMessage(t("profile_age_prefs_invalid"));
      return;
    }
    const { min, max } = normalizePreferredAgeRange(aminRaw, amaxRaw);
    setMessage(null);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          preferred_age_min: min,
          preferred_age_max: max,
        })
        .eq("id", userId);
      if (error) {
        setMessage(error.message || t("action_impossible"));
        return;
      }
      await onAfterSuccessfulSave?.();
      setMessage(SAVE_OK);
    } finally {
      setSaving(false);
    }
  }

  return (
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
          margin: "0 0 4px 0",
          fontSize: "15px",
          fontWeight: 700,
          color: APP_TEXT,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        {t("meet_prefs_section_title")}
      </h2>
      <h3
        style={{
          margin: "0 0 12px 0",
          fontSize: "16px",
          fontWeight: 600,
          color: APP_TEXT,
        }}
      >
        {t("meet_prefs_age_heading")}
      </h3>
      <p
        style={{
          margin: "0 0 14px 0",
          fontSize: "13px",
          fontWeight: 500,
          color: APP_TEXT_MUTED,
          lineHeight: 1.45,
        }}
      >
        {t("meet_prefs_age_hint")}
      </p>
      <div style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 148px", minWidth: "0" }}>
          <span
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: APP_TEXT,
            }}
          >
            {t("meet_prefs_age_from_label")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="number"
              inputMode="numeric"
              min={PROFILE_MIN_VISIBLE_AGE}
              max={130}
              value={prefAgeMinStr}
              onChange={(e) => {
                setPrefAgeMinStr(e.target.value);
                setMessage(null);
              }}
              aria-label={`${t("meet_prefs_age_from_label")} ${t("meet_prefs_age_unit")}`}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: "12px",
                border: `1px solid ${APP_BORDER}`,
                background: APP_BG,
                fontSize: "15px",
                color: APP_TEXT,
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: "14px", fontWeight: 500, color: APP_TEXT_MUTED, flexShrink: 0 }}>
              {t("meet_prefs_age_unit")}
            </span>
          </div>
        </label>
        <label style={{ flex: "1 1 148px", minWidth: "0" }}>
          <span
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: APP_TEXT,
            }}
          >
            {t("meet_prefs_age_to_label")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="number"
              inputMode="numeric"
              min={PROFILE_MIN_VISIBLE_AGE}
              max={130}
              value={prefAgeMaxStr}
              onChange={(e) => {
                setPrefAgeMaxStr(e.target.value);
                setMessage(null);
              }}
              aria-label={`${t("meet_prefs_age_to_label")} ${t("meet_prefs_age_unit")}`}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: "12px",
                border: `1px solid ${APP_BORDER}`,
                background: APP_BG,
                fontSize: "15px",
                color: APP_TEXT,
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: "14px", fontWeight: 500, color: APP_TEXT_MUTED, flexShrink: 0 }}>
              {t("meet_prefs_age_unit")}
            </span>
          </div>
        </label>
      </div>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "12px",
          border: "none",
          fontSize: "14px",
          fontWeight: 600,
          cursor: saving ? "wait" : "pointer",
          background: saving ? CTA_DISABLED_BG : BRAND_BG,
          color: TEXT_ON_BRAND,
        }}
      >
        {saving ? t("loading") : t("meet_prefs_save")}
      </button>
      {message ? (
        <p style={{ margin: "10px 0 0 0", fontSize: "13px", color: APP_TEXT_MUTED }}>
          {message === SAVE_OK ? t("profile_age_prefs_saved") : message}
        </p>
      ) : null}
    </div>
  );
}
