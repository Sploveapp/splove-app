import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { env, hasSupabaseEnv } from "../lib/env";
import { supabase } from "../lib/supabase";
import {
  APP_BG,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  CTA_DISABLED_BG,
  TEXT_ON_BRAND,
} from "../constants/theme";
import { useTranslation } from "../i18n/useTranslation";

const CONFIRM_WORD = "SUPPRIMER";

export default function AccountSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refetchProfile, signOut } = useAuth();
  const [pauseLoading, setPauseLoading] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const canSubmitDelete =
    deleteInput === CONFIRM_WORD && !deleteLoading && hasSupabaseEnv && Boolean(env.supabaseUrl);

  async function handlePause() {
    if (!user?.id || pauseLoading) return;
    setActionMessage(null);
    setPauseLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_paused: true }).eq("id", user.id);
      if (error) {
        setActionMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      setActionMessage(t("account_paused"));
    } finally {
      setPauseLoading(false);
    }
  }

  async function handleDeactivate() {
    if (!user?.id || deactivateLoading) return;
    setActionMessage(null);
    setDeactivateLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", user.id);
      if (error) {
        setActionMessage(error.message || t("action_impossible"));
        return;
      }
      await refetchProfile();
      setActionMessage(t("account_deactivated"));
    } finally {
      setDeactivateLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!user?.id || deleteLoading) return;
    if (deleteInput !== CONFIRM_WORD) {
      setDeleteError(t("delete_input_error"));
      return;
    }
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDeleteError(t("session_expired_relogin"));
        return;
      }
      const url = `${env.supabaseUrl}/functions/v1/delete-account`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: env.supabaseAnonKey ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmPhrase: CONFIRM_WORD }),
      });
      if (!res.ok) {
        let msg = t("delete_unavailable");
        try {
          const j = (await res.json()) as { error?: string };
          if (typeof j.error === "string" && j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        setDeleteError(msg);
        return;
      }
      setDeleteModalOpen(false);
      await signOut();
    } finally {
      setDeleteLoading(false);
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
        <button
          type="button"
          onClick={() => navigate("/profile")}
          style={{
            margin: "0 0 16px 0",
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
            color: APP_TEXT_MUTED,
          }}
        >
          {`← ${t("profile_title")}`}
        </button>

        <h1
          style={{
            margin: "0 0 20px 0",
            fontSize: "14px",
            fontWeight: 600,
            color: APP_TEXT_MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("account")}
        </h1>

        <section
          style={{
            background: APP_CARD,
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px 0",
              fontSize: "17px",
              fontWeight: 600,
              color: APP_TEXT,
            }}
          >
            {t("account_manage_title")}
          </h2>
          <p
            style={{
              margin: "0 0 18px 0",
              fontSize: "13px",
              fontWeight: 500,
              color: APP_TEXT_MUTED,
              lineHeight: 1.45,
            }}
          >
            {t("account_manage_desc")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              disabled={pauseLoading}
              onClick={() => void handlePause()}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "none",
                background: pauseLoading ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "14px",
                fontWeight: 600,
                cursor: pauseLoading ? "wait" : "pointer",
              }}
            >
              {pauseLoading ? t("account_in_progress") : t("account_pause")}
            </button>

            <button
              type="button"
              disabled={deactivateLoading}
              onClick={() => void handleDeactivate()}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                background: "transparent",
                color: APP_TEXT,
                fontSize: "14px",
                fontWeight: 600,
                cursor: deactivateLoading ? "wait" : "pointer",
              }}
            >
              {deactivateLoading ? t("account_in_progress") : t("account_deactivate")}
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteInput("");
                setDeleteModalOpen(true);
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(220, 38, 38, 0.45)",
                background: "transparent",
                color: "#F87171",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("account_delete_forever")}
            </button>
          </div>

          {actionMessage ? (
            <p
              style={{
                margin: "14px 0 0 0",
                fontSize: "13px",
                fontWeight: 500,
                color: actionMessage.includes("impossible") ? "#F87171" : "rgb(52 211 153)",
                lineHeight: 1.45,
              }}
            >
              {actionMessage}
            </p>
          ) : null}
        </section>
      </main>

      {deleteModalOpen ? (
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
          onClick={() => (deleteLoading ? undefined : setDeleteModalOpen(false))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "360px",
              borderRadius: "20px",
              background: APP_CARD,
              padding: "24px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2
              id="delete-account-title"
              style={{
                margin: "0 0 8px 0",
                fontSize: "18px",
                fontWeight: 700,
                color: APP_TEXT,
                lineHeight: 1.3,
              }}
            >
              {t("delete_confirm_title")}
            </h2>
            <p
              style={{
                margin: "0 0 16px 0",
                fontSize: "14px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
              }}
            >
              {t("delete_confirm_desc")}{" "}
              <strong style={{ color: APP_TEXT }}>{CONFIRM_WORD}</strong> ci-dessous.
            </p>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={deleteInput}
              onChange={(e) => {
                setDeleteInput(e.target.value);
                setDeleteError(null);
              }}
              placeholder={CONFIRM_WORD}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: "12px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #2A2A2E",
                background: APP_BG,
                color: APP_TEXT,
                fontSize: "15px",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            />
            {deleteError ? (
              <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#F87171" }}>{deleteError}</p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                disabled={!canSubmitDelete}
                onClick={() => void handleConfirmDelete()}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "none",
                  background: !canSubmitDelete ? CTA_DISABLED_BG : "#DC2626",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: !canSubmitDelete ? "not-allowed" : deleteLoading ? "wait" : "pointer",
                }}
              >
                {deleteLoading ? t("delete_now") : t("delete_confirm_button")}
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid #2A2A2E",
                  background: "transparent",
                  color: APP_TEXT_MUTED,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: deleteLoading ? "wait" : "pointer",
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
