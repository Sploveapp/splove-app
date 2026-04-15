import { useMemo, useState } from "react";
import {
  PHOTO_REPORT_REASON_LABELS,
  PHOTO_REPORT_REASON_VALUES,
  type PhotoReportReasonValue,
} from "../constants/photoReports";
import { createPhotoReport } from "../services/photoReports.service";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";

type Props = {
  reportedUserId: string;
  reporterUserId: string;
  portraitUrl?: string | null;
  fullbodyUrl?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

const TITLE = "Signaler cette photo";
const SUBMIT = "Envoyer le signalement";
const CANCEL = "Annuler";
const CLOSE = "Fermer";
const CONFIRM = "Merci, nous avons bien reçu ton signalement.";

export function ReportPhotoModal({
  reportedUserId,
  reporterUserId,
  portraitUrl,
  fullbodyUrl,
  onClose,
  onSubmitted,
}: Props) {
  const [photoSlot, setPhotoSlot] = useState<1 | 2>(1);
  const [reason, setReason] = useState<PhotoReportReasonValue | "">("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canPickSlot2 = useMemo(
    () => Boolean(fullbodyUrl && String(fullbodyUrl).trim().length > 0),
    [fullbodyUrl],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setError(null);
    setLoading(true);
    const { error: err } = await createPhotoReport({
      reporterUserId,
      reportedUserId,
      photoSlot,
      reason: reason as PhotoReportReasonValue,
      comment: comment.trim() || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSubmitted(true);
    onSubmitted?.();
  }

  if (submitted) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 60,
          padding: "24px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: APP_CARD,
            borderRadius: "20px",
            padding: "28px 24px",
            maxWidth: "380px",
            width: "100%",
            border: `1px solid ${APP_BORDER}`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <p style={{ margin: "0 0 20px 0", fontSize: "15px", color: APP_TEXT, textAlign: "center" }}>
            {CONFIRM}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              background: BRAND_BG,
              color: TEXT_ON_BRAND,
              fontWeight: 600,
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            {CLOSE}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          background: APP_CARD,
          borderRadius: "20px",
          padding: "24px",
          maxWidth: "400px",
          width: "100%",
          border: `1px solid ${APP_BORDER}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 8px 0", fontSize: "18px", color: APP_TEXT }}>{TITLE}</h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: APP_TEXT_MUTED, lineHeight: 1.45 }}>
          Indique quelle photo pose problème et la raison. Notre équipe traitera le signalement.
        </p>

        <label style={{ display: "block", marginBottom: "10px", fontSize: "13px", fontWeight: 600, color: APP_TEXT }}>
          Photo concernée
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: APP_TEXT }}>
            <input
              type="radio"
              name="photo-slot"
              checked={photoSlot === 1}
              onChange={() => setPhotoSlot(1)}
            />
            Photo principale (portrait)
            {!portraitUrl?.trim() ? (
              <span style={{ color: APP_TEXT_MUTED, fontSize: "12px" }}>(URL absente)</span>
            ) : null}
          </label>
          {canPickSlot2 ? (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: APP_TEXT }}>
              <input
                type="radio"
                name="photo-slot"
                checked={photoSlot === 2}
                onChange={() => setPhotoSlot(2)}
              />
              Photo en pied / silhouette
            </label>
          ) : null}
        </div>

        <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: APP_TEXT }}>
          Motif
        </label>
        <select
          value={reason}
          onChange={(e) => setReason((e.target.value || "") as PhotoReportReasonValue | "")}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "12px",
            border: `1px solid ${APP_BORDER}`,
            marginBottom: "14px",
            fontSize: "14px",
            color: APP_TEXT,
            background: APP_CARD,
          }}
          required
        >
          <option value="">Choisir…</option>
          {PHOTO_REPORT_REASON_VALUES.map((v) => (
            <option key={v} value={v}>
              {PHOTO_REPORT_REASON_LABELS[v]}
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: APP_TEXT }}>
          Précision (optionnel)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "12px",
            border: `1px solid ${APP_BORDER}`,
            marginBottom: "14px",
            fontSize: "14px",
            color: APP_TEXT,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        {error ? (
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#f87171" }}>{error}</p>
        ) : null}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: `1px solid ${APP_BORDER}`,
              background: "transparent",
              color: APP_TEXT_MUTED,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {CANCEL}
          </button>
          <button
            type="submit"
            disabled={loading || !reason}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              background: loading || !reason ? CTA_DISABLED_BG : BRAND_BG,
              color: TEXT_ON_BRAND,
              fontWeight: 600,
              cursor: loading || !reason ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "…" : SUBMIT}
          </button>
        </div>
      </form>
    </div>
  );
}
