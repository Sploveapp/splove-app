import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
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
import {
  buildPublicSploveInviteLink,
  countReferralsAsReferrer,
  fetchGrowthProfileFields,
} from "../services/referral.service";

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError";
}

async function shareOrCopy(inviteUrl: string, title: string, text: string): Promise<"shared" | "copied" | "abort"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const data: ShareData = { title, text, url: inviteUrl };
    try {
      if (navigator.canShare && !navigator.canShare(data)) {
        throw new Error("cannot_share");
      }
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (isAbortError(e)) return "abort";
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteUrl);
      return "copied";
    }
  } catch {
    /* fallback below */
  }
  return "abort";
}

export default function InviteFriendScreen() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ctaBusy, setCtaBusy] = useState(false);
  const [flash, setFlash] = useState<"copied" | null>(null);

  const inviteUrl = useMemo(
    () => (referralCode ? buildPublicSploveInviteLink(referralCode) : ""),
    [referralCode],
  );

  const shareSnippet = useMemo(() => {
    if (!inviteUrl) return "";
    return language === "en"
      ? `Join me on SPLove — sport meetups: ${inviteUrl}`
      : `Rejoins-moi sur SPLove — rencontres sportives : ${inviteUrl}`;
  }, [inviteUrl, language]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [growth, count] = await Promise.all([
        fetchGrowthProfileFields(user.id),
        countReferralsAsReferrer(user.id),
      ]);
      setInviteCount(count);
      setReferralCode(growth?.referral_code?.trim() ? growth.referral_code.trim().toUpperCase() : null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (flash !== "copied") return;
    const id = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(id);
  }, [flash]);

  async function runPrimaryInvite() {
    if (!inviteUrl || ctaBusy) return;
    setCtaBusy(true);
    try {
      const outcome = await shareOrCopy(inviteUrl, "SPLove", shareSnippet);
      if (outcome === "copied") setFlash("copied");
    } finally {
      setCtaBusy(false);
    }
  }

  function openWhatsApp() {
    if (!shareSnippet) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareSnippet)}`, "_blank", "noopener,noreferrer");
  }

  function openSms() {
    if (!shareSnippet) return;
    window.location.href = `sms:?body=${encodeURIComponent(shareSnippet)}`;
  }

  async function copyOnly() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setFlash("copied");
    } catch {
      /* ignore */
    }
  }

  const secondaryBtn = {
    width: "100%" as const,
    padding: "12px 14px",
    borderRadius: "12px",
    border: `1px solid ${APP_BORDER}`,
    background: "transparent",
    color: APP_TEXT,
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer" as const,
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: APP_BG,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <main
        style={{
          padding: "24px",
          paddingBottom: "88px",
          maxWidth: "420px",
          margin: "0 auto",
          boxSizing: "border-box",
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
          {`← ${t("invite_friend_back")}`}
        </button>

        <h1
          style={{
            margin: "0 0 20px 0",
            fontSize: "22px",
            fontWeight: 700,
            color: APP_TEXT,
            lineHeight: 1.25,
          }}
        >
          {t("invite_friend_header")}
        </h1>

        {loading ? (
          <p style={{ margin: 0, fontSize: "14px", color: APP_TEXT_MUTED }}>{t("invite_friend_loading")}</p>
        ) : referralCode ? (
          <>
            <section style={{ marginBottom: "22px" }}>
              <p style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 600, color: APP_TEXT }}>
                {t("invite_friend_hero_1")}
              </p>
              <p style={{ margin: 0, fontSize: "15px", fontWeight: 500, color: APP_TEXT_MUTED, lineHeight: 1.55 }}>
                {t("invite_friend_hero_2")}
              </p>
            </section>

            <p style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: 600, color: APP_TEXT }}>
              {t("invite_friend_invited_count", { n: inviteCount })}
            </p>

            <div
              style={{
                background: APP_CARD,
                borderRadius: "20px",
                padding: "20px 22px",
                marginBottom: "20px",
                border: `1px solid ${APP_BORDER}`,
              }}
            >
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <li style={{ fontSize: "15px", fontWeight: 600, color: APP_TEXT }}>
                  {t("invite_friend_reward_boosts")}
                </li>
                <li style={{ fontSize: "15px", fontWeight: 600, color: APP_TEXT }}>
                  {t("invite_friend_reward_returns")}
                </li>
                <li style={{ fontSize: "15px", fontWeight: 600, color: APP_TEXT }}>
                  {t("invite_friend_reward_second_chance")}
                </li>
                <li style={{ fontSize: "15px", fontWeight: 600, color: APP_TEXT }}>
                  {t("invite_friend_reward_beta")}
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={ctaBusy}
              onClick={() => void runPrimaryInvite()}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "none",
                marginBottom: "14px",
                background: ctaBusy ? CTA_DISABLED_BG : BRAND_BG,
                color: TEXT_ON_BRAND,
                fontSize: "16px",
                fontWeight: 700,
                cursor: ctaBusy ? "wait" : "pointer",
              }}
            >
              {t("invite_friend_cta")}
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
              <button type="button" onClick={() => openWhatsApp()} style={secondaryBtn}>
                {t("invite_friend_whatsapp")}
              </button>
              <button type="button" onClick={() => openSms()} style={secondaryBtn}>
                {t("invite_friend_sms")}
              </button>
              <button type="button" onClick={() => void copyOnly()} style={secondaryBtn}>
                {t("invite_friend_copy_link")}
              </button>
            </div>

            {flash === "copied" ? (
              <p
                style={{
                  margin: "-12px 0 18px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "rgb(52 211 153)",
                }}
              >
                {t("rl_session_link_copied")}
              </p>
            ) : null}

            <p
              style={{
                margin: 0,
                fontSize: "13px",
                fontWeight: 500,
                color: APP_TEXT_MUTED,
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              {t("invite_friend_bonus_footer")}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "14px", color: APP_TEXT_MUTED }}>{t("invite_friend_error_no_code")}</p>
        )}
      </main>
    </div>
  );
}
