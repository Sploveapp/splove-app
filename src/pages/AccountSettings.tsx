import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useTranslation } from "../i18n/useTranslation";
const CONFIRM_WORD = "SUPPRIMER";

function mapDeleteAccountFailureMessage(
  t: (key: string, vars?: Record<string, string | number>) => string,
  payload: { ok?: boolean; error?: string } | null,
  invokeError: unknown,
): string {
  const code = payload?.error?.trim();
  if (code === "missing_authorization" || code === "unauthorized") {
    return t("session_expired_relogin");
  }
  if (code === "confirmation_invalid") return t("delete_input_error");
  if (code === "server_misconfigured") return t("delete_error_service");
  if (
    code === "delete_messages_failed" ||
    code === "delete_matches_failed" ||
    code === "delete_profile_failed" ||
    code === "delete_auth_user_failed"
  ) {
    return t("delete_error_cleanup");
  }
  const ie = invokeError as { message?: string } | undefined;
  const msg = (ie?.message ?? "").toLowerCase();
  if (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("non-2xx") ||
    msg.includes("edge function")
  ) {
    return t("delete_error_function");
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return t("delete_error_network");
  }
  return t("delete_unavailable");
}

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

  const canSubmitDelete = deleteInput === CONFIRM_WORD && !deleteLoading;

  async function handlePause() {
    if (!user?.id || pauseLoading) return;
    setActionMessage(null);
    setPauseLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_paused: true, is_active: false })
        .eq("id", user.id);
      if (error) {
        console.warn("[account] pause", error.message);
        setActionMessage(t("action_impossible"));
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
    if (!window.confirm(t("account_deactivate_confirm_message"))) return;
    setActionMessage(null);
    setDeactivateLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", user.id);
      if (error) {
        console.warn("[account] deactivate", error.message);
        setActionMessage(t("action_impossible"));
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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setDeleteError(t("session_expired_relogin"));
        return;
      }

      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        "delete-my-account",
        {
          body: { confirmPhrase: CONFIRM_WORD },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const payload = data ?? null;
      const ok = Boolean(!error && payload?.ok === true);

      console.warn("[account] delete-my-account result", {
        ok,
        serverError: payload?.error ?? null,
        invokeMessage: error?.message ?? null,
      });

      if (!ok) {
        setDeleteError(mapDeleteAccountFailureMessage(t, payload, error));
        return;
      }
      setDeleteModalOpen(false);
      setDeleteInput("");
      await signOut({ scope: "local" });
      navigate("/auth", { replace: true });
    } catch (error) {
      console.warn("[account] delete-my-account exception", error);
      setDeleteError(mapDeleteAccountFailureMessage(t, null, error));
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

        <button
          type="button"
          onClick={() => navigate("/invite")}
          style={{
            width: "100%",
            margin: "0 0 18px 0",
            padding: "12px 14px",
            borderRadius: "12px",
            border: `1px solid ${APP_BORDER}`,
            background: APP_CARD,
            color: APP_TEXT,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {t("invite_friend_header")}
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
                color: actionMessage === t("action_impossible") ? "#F87171" : "rgb(52 211 153)",
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
              <strong style={{ color: APP_TEXT }}>{CONFIRM_WORD}</strong> {t("delete_confirm_suffix")}
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
