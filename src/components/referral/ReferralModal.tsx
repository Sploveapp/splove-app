import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackReferralEvent } from "../../lib/referral";
import { buildPublicSploveInviteLink } from "../../services/referral.service";
import { useTranslation } from "../../i18n/useTranslation";
import ReferralSuccess from "./ReferralSuccess";

export type ReferralModalProps = {
  open: boolean;
  onClose: () => void;
  referralCode?: string | null;
  variant?: "A" | "B" | "C";
};

type ModalInner = {
  title: string;
  subtitle: string;
  rewards: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  micro?: string;
  showSecondary?: boolean;
};

const INNER: Record<"A" | "B", ModalInner> = {
  A: {
    title: "Plus de profils réels autour de toi",
    subtitle: "Accès bêta gratuit — plus vous êtes, plus ça matche vite.",
    rewards: ["Toi → Boost 30 min", "Ton ami → Boost 30 min"],
    primaryLabel: "Partager le lien",
    secondaryLabel: "Copier le lien",
    micro: "Fonctionne avec WhatsApp, Insta, SMS",
    showSecondary: true,
  },
  B: {
    title: "Plus de profils réels autour de toi",
    subtitle:
      "Accès bêta gratuit — invite quelqu’un et relance ta zone avec des matchs là où tu bouges.",
    rewards: ["Boost offert pour vous deux"],
    primaryLabel: "Inviter maintenant",
  },
};

function isAbortShare(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError";
}

export default function ReferralModal({ open, onClose, referralCode, variant = "A" }: ReferralModalProps) {
  const { t } = useTranslation();
  const [success, setSuccess] = useState(false);
  const [inviteImpactNonce, setInviteImpactNonce] = useState(0);
  const [repeatInviteBusy, setRepeatInviteBusy] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const [invitePrimed, setInvitePrimed] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteTimerRef = useRef<number | null>(null);
  const shareBusyRef = useRef(false);

  const classicInner = variant !== "C" ? INNER[variant] ?? INNER.A : null;

  const inviteUrl = useMemo(() => {
    const ref = referralCode?.trim();
    if (variant === "C" && ref) {
      return buildPublicSploveInviteLink(ref);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "?ref=";
    return `${origin}${base}#/auth${q}`;
  }, [referralCode, variant]);

  const finalizeInviteSent = useCallback(async () => {
    setSuccess(true);
    setInviteImpactNonce((n) => n + 1);
    await trackReferralEvent("invite_sent", { variant, url: inviteUrl });
  }, [variant, inviteUrl]);

  const copyLinkClassic = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
      await finalizeInviteSent();
    } catch {
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
    }
  }, [finalizeInviteSent, inviteUrl]);

  const shareOrCopyClassic = useCallback(async () => {
    const row = variant !== "C" ? INNER[variant] ?? INNER.A : INNER.A;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: row.title,
          text: `${row.subtitle}\n`,
          url: inviteUrl,
        });
        await finalizeInviteSent();
        return;
      } catch (e) {
        if (isAbortShare(e)) return;
      }
    }
    await copyLinkClassic();
  }, [copyLinkClassic, finalizeInviteSent, inviteUrl, variant]);

  const primeMs = 1000;

  const shareVariantC = useCallback(async () => {
    const title = t("discover.referral_zone_title");
    const subtitle = t("discover.referral_zone_subtitle");
    const textPayload = `${subtitle}\n${inviteUrl}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        const payload: ShareData = { title, text: textPayload, url: inviteUrl };
        if (navigator.canShare && !navigator.canShare(payload)) {
          throw new Error("cannot_share");
        }
        await navigator.share(payload);
        await finalizeInviteSent();
        return;
      } catch (e) {
        if (isAbortShare(e)) return;
      }
    }
    try {
      await navigator.clipboard?.writeText(inviteUrl);
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
      await finalizeInviteSent();
    } catch {
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
    }
  }, [finalizeInviteSent, inviteUrl, t]);

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setInviteImpactNonce(0);
      setRepeatInviteBusy(false);
      setCopiedHint(false);
      setInvitePrimed(false);
      setInviteBusy(false);
      shareBusyRef.current = false;
      if (inviteTimerRef.current != null) {
        window.clearTimeout(inviteTimerRef.current);
        inviteTimerRef.current = null;
      }
    }
  }, [open]);

  const handleZoneInvite = useCallback(() => {
    if (inviteBusy || shareBusyRef.current || success) return;
    shareBusyRef.current = true;
    setInviteBusy(true);
    setInvitePrimed(true);
    inviteTimerRef.current = window.setTimeout(() => {
      inviteTimerRef.current = null;
      void (async () => {
        setInvitePrimed(false);
        try {
          await shareVariantC();
        } finally {
          shareBusyRef.current = false;
          setInviteBusy(false);
        }
      })();
    }, primeMs);
  }, [inviteBusy, shareVariantC, success]);

  const handleInviteAnother = useCallback(async () => {
    if (repeatInviteBusy) return;
    setRepeatInviteBusy(true);
    try {
      if (variant === "C") {
        await shareVariantC();
      } else {
        await shareOrCopyClassic();
      }
    } finally {
      setRepeatInviteBusy(false);
    }
  }, [repeatInviteBusy, shareOrCopyClassic, shareVariantC, variant]);

  if (!open) return null;

  const zoneRewardKeys = [
    "discover.referral_zone_reward_1",
    "discover.referral_zone_reward_2",
    "discover.referral_zone_reward_3",
    "discover.referral_zone_reward_4",
  ] as const;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-3 pb-0 pt-10 backdrop-blur-[2px] sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={success ? "referral-success-title" : "referral-modal-title"}
        className="mb-safe max-h-[min(88vh,560px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#FF1E2D]/25 bg-[#0f0f16] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className={`flex shrink-0 items-start ${success ? "justify-end" : "justify-between gap-3"}`}>
          {!success ? (
            <h2
              id="referral-modal-title"
              className="text-lg font-bold leading-snug text-[#F5F5F7] sm:text-xl"
            >
              {variant === "C" ? t("discover.referral_zone_title") : classicInner!.title}
            </h2>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        {success ? (
          <ReferralSuccess
            reloadNonce={inviteImpactNonce}
            inviteAgainBusy={repeatInviteBusy}
            onInviteAgain={handleInviteAnother}
            onViewArea={onClose}
          />
        ) : variant === "C" ? (
          <>
            <p className="mt-3 text-[14px] leading-relaxed text-white/62">
              {t("discover.referral_zone_subtitle")}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/45">
              {t("discover.referral_zone_secondary")}
            </p>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/40">
              {t("discover.referral_zone_unlock_heading")}
            </p>
            <ul className="mt-2 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
              {zoneRewardKeys.map((k) => (
                <li key={k} className="text-[13px] font-medium text-[#F5F5F7]">
                  {t(k)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-white/50">{t("discover.referral_zone_note")}</p>
            {copiedHint ? (
              <p className="mt-3 text-center text-[12px] font-medium text-emerald-300/95">
                {t("rl_session_link_copied")}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={inviteBusy}
                onClick={handleZoneInvite}
                className="w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#FF1E2D]/18 transition hover:opacity-95 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                {t("discover.referral_zone_cta_invite")}
              </button>
            </div>
            {invitePrimed ? (
              <p className="mt-4 text-center text-[13px] font-semibold leading-snug text-[#FFB3BC]">
                {t("discover.referral_zone_micro_before_share")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl border border-white/10 py-2.5 text-[13px] font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white/75"
            >
              {t("discover.referral_zone_later")}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[14px] leading-relaxed text-white/62">{classicInner!.subtitle}</p>
            <ul className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
              {classicInner!.rewards.map((line) => (
                <li key={line} className="text-[13px] font-medium text-[#F5F5F7]">
                  {line}
                </li>
              ))}
            </ul>
            {copiedHint ? (
              <p className="mt-3 text-center text-[12px] font-medium text-emerald-300/95">
                {t("rl_session_link_copied")}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void shareOrCopyClassic()}
                className="w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#FF1E2D]/18 transition hover:opacity-95 active:scale-[0.99]"
              >
                {classicInner!.primaryLabel}
              </button>
              {classicInner!.showSecondary && classicInner!.secondaryLabel ? (
                <button
                  type="button"
                  onClick={() => void copyLinkClassic()}
                  className="w-full rounded-xl border border-white/12 bg-transparent py-3 text-[14px] font-semibold text-white/90 transition hover:bg-white/5"
                >
                  {classicInner!.secondaryLabel}
                </button>
              ) : null}
            </div>
            {classicInner!.micro ? (
              <p className="mt-3 text-center text-[11px] text-white/38">{classicInner!.micro}</p>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl border border-white/10 py-2.5 text-[13px] font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white/75"
            >
              {t("discover.referral_zone_later")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
