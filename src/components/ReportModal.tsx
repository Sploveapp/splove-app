import { useState } from "react";
import { REPORT_REASONS, type ReportReasonValue } from "../constants/safety";
import {
  REPORT_TITLE,
  REPORT_REASON_LABEL,
  REPORT_SUBMIT,
  REPORT_CONFIRM,
  REPORT_CANCEL,
  BTN_CLOSE,
} from "../constants/copy";
import { createReport } from "../services/reports.service";
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
  reportedProfileId: string;
  reporterId: string;
  onClose: () => void;
  /** Called after successful submit (optional) */
  onSubmitted?: () => void;
};

export function ReportModal({
  reportedProfileId,
  reporterId,
  onClose,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState<ReportReasonValue | "">("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setError(null);
    setLoading(true);
    const { error: err } = await createReport({
      reporterId,
      reportedProfileId,
      reason: reason as ReportReasonValue,
      details: details.trim() || null,
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
          zIndex: 50,
          padding: "24px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: APP_CARD,
            borderRadius: "20px",
            padding: "28px 24px",
            maxWidth: "360px",
            width: "100%",
            border: `1px solid ${APP_BORDER}`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ margin: "0 0 20px 0", fontSize: "15px", color: APP_TEXT, textAlign: "center" }}>
            {REPORT_CONFIRM}
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
            {BTN_CLOSE}
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
        zIndex: 50,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: APP_CARD,
          borderRadius: "20px",
          padding: "28px 24px",
          maxWidth: "400px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          border: `1px solid ${APP_BORDER}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: "0 0 20px 0",
            fontSize: "18px",
            fontWeight: 700,
            color: APP_TEXT,
          }}
        >
          {REPORT_TITLE}
        </h2>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 600, color: APP_TEXT }}>
            {REPORT_REASON_LABEL}
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReasonValue)}
            required
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "12px",
              border: `1px solid ${APP_BORDER}`,
              background: "#0F0F14",
              color: APP_TEXT,
              fontSize: "15px",
              marginBottom: "16px",
              boxSizing: "border-box",
            }}
          >
            <option value="">Choisir un motif</option>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: APP_TEXT_MUTED }}>
            Détails (optionnel)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Précisez si vous le souhaitez..."
            rows={3}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "12px",
              border: `1px solid ${APP_BORDER}`,
              background: "#0F0F14",
              color: APP_TEXT,
              fontSize: "14px",
              marginBottom: "16px",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#dc2626" }}>{error}</p>
          )}

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
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              {REPORT_CANCEL}
            </button>
            <button
              type="submit"
              disabled={loading || !reason}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "12px",
                border: "none",
                background: reason && !loading ? BRAND_BG : CTA_DISABLED_BG,
                color: TEXT_ON_BRAND,
                fontWeight: 600,
                fontSize: "15px",
                cursor: reason && !loading ? "pointer" : "not-allowed",
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? "Envoi…" : REPORT_SUBMIT}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
