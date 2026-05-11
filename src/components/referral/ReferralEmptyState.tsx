import { useCallback, useEffect, useMemo, useState } from "react";
import type { Language } from "../../i18n";
import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";

/** URL publique SPLove (hash router). */
export const REFERRAL_PUBLIC_APP_URL = "https://splove-app.onrender.com/#/";

const COPY: Record<
  Language,
  {
    title: string;
    subtitle: string;
    primaryCta: string;
    shareHint: string;
    whatsapp: string;
    messages: string;
    copyLink: string;
    copyToast: string;
    shareTitle: string;
    shareText: string;
  }
> = {
  fr: {
    title: "Plus il y a de sportifs sur SPLove, plus les vraies rencontres commencent.",
    subtitle: "Parraine tes amis.\nDébloquez des avantages exclusifs. ⚡",
    primaryCta: "Inviter des amis",
    shareHint: "Partage via WhatsApp, Messages ou tes réseaux.",
    whatsapp: "WhatsApp",
    messages: "Messages",
    copyLink: "Copier le lien",
    copyToast: "Lien copié",
    shareTitle: "SPLove - Trouve l’amour par le sport",
    shareText:
      "Rejoins-moi sur SPLove ❤️ Une nouvelle façon de rencontrer des sportifs célibataires.",
  },
  en: {
    title: "The more athletes join SPLove, the more real connections begin.",
    subtitle: "Invite your friends.\nUnlock exclusive beta perks. ⚡",
    primaryCta: "Invite friends",
    shareHint: "Share via WhatsApp, Messages, or your social networks.",
    whatsapp: "WhatsApp",
    messages: "Messages",
    copyLink: "Copy link",
    copyToast: "Link copied",
    shareTitle: "SPLove - Find love through sport",
    shareText: "Join me on SPLove ❤️ A new way to meet single sporty people.",
  },
};

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError";
}

export type ReferralEmptyStateProps = {
  language: Language;
};

export function ReferralEmptyState({ language }: ReferralEmptyStateProps) {
  const c = COPY[language] ?? COPY.fr;
  const [toastVisible, setToastVisible] = useState(false);

  const fullShareBody = useMemo(
    () => `${c.shareText}\n\n${REFERRAL_PUBLIC_APP_URL}`,
    [c.shareText],
  );

  useEffect(() => {
    if (!toastVisible) return;
    const id = window.setTimeout(() => setToastVisible(false), 2400);
    return () => window.clearTimeout(id);
  }, [toastVisible]);

  const invitePrimary = useCallback(async () => {
    const data: ShareData = {
      title: c.shareTitle,
      text: c.shareText,
      url: REFERRAL_PUBLIC_APP_URL,
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        if (!navigator.canShare || navigator.canShare(data)) {
          await navigator.share(data);
          return;
        }
      } catch (e) {
        if (isAbortError(e)) return;
      }
    }
  }, [c.shareText, c.shareTitle]);

  const openWhatsApp = useCallback(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(fullShareBody)}`, "_blank", "noopener,noreferrer");
  }, [fullShareBody]);

  const openMessages = useCallback(() => {
    window.location.href = `sms:?body=${encodeURIComponent(fullShareBody)}`;
  }, [fullShareBody]);

  const copyPublicLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(REFERRAL_PUBLIC_APP_URL);
      setToastVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  const secondaryBtnClass =
    "w-full rounded-2xl border border-app-border/90 bg-neutral-950/80 py-3.5 text-[15px] font-semibold text-app-text shadow-sm ring-1 ring-white/[0.04] transition hover:bg-app-border/40 active:opacity-95";

  return (
    <div className="mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0b0f] px-4 pb-8 pt-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-[#FF1E2D]/15">
      <div className="relative mx-auto mb-6 h-[168px] w-full max-w-[320px]">
        <div className="absolute left-[2%] top-0 z-10 aspect-[4/5] w-[42%] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-rose-900/70 via-neutral-950 to-neutral-950 shadow-lg shadow-black/40 -rotate-6">
          <div className="flex h-full w-full items-center justify-center gap-0.5 text-3xl drop-shadow-md">🚴‍♀️🚴‍♂️</div>
        </div>
        <div className="absolute right-[6%] top-[4%] z-20 aspect-[4/5] w-[44%] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-950/60 via-neutral-950 to-neutral-950 shadow-lg shadow-black/40 rotate-3">
          <div className="flex h-full w-full items-center justify-center text-4xl drop-shadow-md">🛹</div>
        </div>
      </div>

      <h2 className="text-center text-[1.12rem] font-bold leading-snug tracking-tight text-app-text">{c.title}</h2>
      <p className="mt-4 whitespace-pre-line text-center text-[15px] font-medium leading-relaxed text-app-muted">{c.subtitle}</p>

      <button
        type="button"
        onClick={() => void invitePrimary()}
        className="mt-6 w-full rounded-2xl py-3.5 text-[16px] font-bold shadow-md transition hover:opacity-95 active:opacity-90"
        style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
      >
        {c.primaryCta}
      </button>

      <p className="mt-4 text-center text-[12px] font-medium leading-relaxed text-app-muted/90">{c.shareHint}</p>

      <div className="mt-4 flex flex-col gap-2.5">
        <button type="button" className={secondaryBtnClass} onClick={openWhatsApp}>
          {c.whatsapp}
        </button>
        <button type="button" className={secondaryBtnClass} onClick={openMessages}>
          {c.messages}
        </button>
        <button type="button" className={secondaryBtnClass} onClick={() => void copyPublicLink()}>
          {c.copyLink}
        </button>
      </div>

      {toastVisible ? (
        <output
          role="status"
          aria-live="polite"
          className="fixed bottom-28 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-emerald-500/30 bg-emerald-950/95 px-4 py-3 text-[14px] font-semibold text-emerald-200 shadow-lg"
        >
          {c.copyToast}
        </output>
      ) : null}
    </div>
  );
}
