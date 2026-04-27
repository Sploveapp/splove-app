import { BRAND_BG, TEXT_ON_BRAND } from "../constants/theme";

type SecondChancePassCardProps = {
  onSendMessage: () => void;
  onDismiss: () => void;
  title: string;
  subtitle: string;
  ctaLabel: string;
  dismissLabel: string;
};

/**
 * Shown after a pass swipe: optional one-time message, not a chat entry point.
 */
export function SecondChancePassCard({
  onSendMessage,
  onDismiss,
  title,
  subtitle,
  ctaLabel,
  dismissLabel,
}: SecondChancePassCardProps) {
  return (
    <div className="mb-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-app-card to-app-bg/80 px-4 py-4 shadow-sm ring-1 ring-white/[0.04]">
      <p className="text-[16px] font-semibold tracking-tight text-app-text">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-app-muted">{subtitle}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onSendMessage}
          className="w-full rounded-xl px-4 py-3 text-center text-[15px] font-semibold shadow-md transition active:scale-[0.99] sm:flex-1"
          style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl border border-app-border/90 py-2.5 text-[14px] font-medium text-app-muted transition hover:text-app-text sm:flex-1"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
