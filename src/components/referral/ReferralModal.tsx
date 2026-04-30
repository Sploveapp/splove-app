import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildInviteAuthUrl,
  trackReferralEvent,
} from "../../lib/referral";

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

const INNER: Record<"A" | "B" | "C", ModalInner> = {
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
  C: {
    title: "Active ta zone",
    subtitle: "Plus de profils réels autour de toi",
    rewards: ["Accès bêta gratuit", "Badge bêta fondateur bientôt disponible"],
    primaryLabel: "Envoyer une invitation",
  },
};

export default function ReferralModal({
  open,
  onClose,
  referralCode,
  variant = "A",
}: ReferralModalProps) {
  const [success, setSuccess] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setCopiedHint(false);
    }
  }, [open]);

  const inner = INNER[variant] ?? INNER.A;

  const inviteUrl = useMemo(() => buildInviteAuthUrl(referralCode ?? null), [referralCode]);

  const shareTitle = inner.title;

  const runSuccess = useCallback(async () => {
    setSuccess(true);
    await trackReferralEvent("invite_sent", { variant, url: inviteUrl });
  }, [variant, inviteUrl]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
      await runSuccess();
    } catch {
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2200);
    }
  }, [inviteUrl, runSuccess]);

  const shareOrCopy = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${inner.subtitle}\n`,
          url: inviteUrl,
        });
        await runSuccess();
        return;
      } catch (e) {
        const err = e as { name?: string };
        if (err?.name === "AbortError") return;
      }
    }
    await copyLink();
  }, [copyLink, inner.subtitle, inviteUrl, runSuccess, shareTitle]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-3 pb-0 pt-10 backdrop-blur-[2px] sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-modal-title"
        className="mb-safe max-h-[min(88vh,560px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#FF1E2D]/25 bg-[#0f0f16] p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="referral-modal-title"
            className="text-lg font-bold leading-snug text-[#F5F5F7] sm:text-xl"
          >
            {success ? "🔥 C’est envoyé" : inner.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="mt-4 space-y-3">
            <p className="text-[14px] leading-relaxed text-white/75">
              Tu seras prévenu dès qu’il rejoint
            </p>
            <p className="text-[13px] leading-relaxed text-[#FF8FA3]/95">
              Plus tu invites, plus ta zone devient active
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 py-3 text-[14px] font-semibold text-white/90 transition hover:bg-white/10"
            >
              Plus tard
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[14px] leading-relaxed text-white/62">{inner.subtitle}</p>
            <ul className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
              {inner.rewards.map((line) => (
                <li key={line} className="text-[13px] font-medium text-[#F5F5F7]">
                  {line}
                </li>
              ))}
            </ul>
            {copiedHint ? (
              <p className="mt-3 text-center text-[12px] font-medium text-emerald-300/95">
                Lien copié
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void shareOrCopy()}
                className="w-full rounded-xl bg-gradient-to-r from-[#FF1E2D] to-[#E0105C] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#FF1E2D]/18 transition hover:opacity-95 active:scale-[0.99]"
              >
                {inner.primaryLabel}
              </button>
              {inner.showSecondary && inner.secondaryLabel ? (
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="w-full rounded-xl border border-white/12 bg-transparent py-3 text-[14px] font-semibold text-white/90 transition hover:bg-white/5"
                >
                  {inner.secondaryLabel}
                </button>
              ) : null}
            </div>
            {inner.micro ? (
              <p className="mt-3 text-center text-[11px] text-white/38">{inner.micro}</p>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl border border-white/10 py-2.5 text-[13px] font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white/75"
            >
              Plus tard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
