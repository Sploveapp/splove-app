import { useState } from "react";
import { motion } from "framer-motion";
import { BRAND_BG, TEXT_ON_BRAND } from "../../constants/theme";
import { BADGE_PLUS_LABEL } from "../../constants/copy";
import { sportEmojiHint } from "../../lib/chatActivity";
import type { CoachCompatibilityLevel } from "../../lib/splovePlusAssistant";
import { useTranslation } from "../../i18n/useTranslation";
import type { TranslationKey } from "../../i18n";

type Props = {
  sport: string;
  dateLabel: string;
  timeLabel: string;
  place: string;
  message: string;
  compatibility: CoachCompatibilityLevel;
  priorityEnabled: boolean;
  onPriorityChange: (enabled: boolean) => void;
  sending: boolean;
  error: string | null;
  onEdit: () => void;
  onSubmit: () => void;
};

const COMPAT_UI: Record<
  CoachCompatibilityLevel,
  { emoji: string; titleKey: TranslationKey; bodyKey: TranslationKey; ring: string; bg: string }
> = {
  strong: {
    emoji: "🟢",
    titleKey: "coach_compat_strong_title",
    bodyKey: "coach_compat_strong_body",
    ring: "ring-emerald-500/15",
    bg: "bg-emerald-500/[0.06]",
  },
  good: {
    emoji: "🟡",
    titleKey: "coach_compat_good_title",
    bodyKey: "coach_compat_good_body",
    ring: "ring-amber-500/15",
    bg: "bg-amber-500/[0.06]",
  },
  customize: {
    emoji: "🔵",
    titleKey: "coach_compat_customize_title",
    bodyKey: "coach_compat_customize_body",
    ring: "ring-sky-500/15",
    bg: "bg-sky-500/[0.06]",
  },
};

function ProposalRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 py-3.5 first:pt-0 last:pb-0">
      <span className="w-6 shrink-0 text-center text-[17px] leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">{label}</p>
        <div className="mt-1 text-[15px] font-medium leading-snug text-app-text">{children}</div>
      </div>
    </div>
  );
}

/**
 * Écran Coach SPLove+ — proposition prête à envoyer, ton premium et rassurant.
 */
export function CoachSplovePlusPreview({
  sport,
  dateLabel,
  timeLabel,
  place,
  message,
  compatibility,
  priorityEnabled,
  onPriorityChange,
  sending,
  error,
  onEdit,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [priorityInfoOpen, setPriorityInfoOpen] = useState(false);
  const compat = COMPAT_UI[compatibility];
  const sportEmoji = sportEmojiHint(sport);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-5 px-5 pb-6 pt-2"
    >
      <div
        className={`rounded-2xl border border-app-border/60 px-4 py-3.5 ring-1 ${compat.ring} ${compat.bg}`}
      >
        <p className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-app-text">
          <span aria-hidden>{compat.emoji}</span>
          {t(compat.titleKey)}
        </p>
        <p className="mt-1.5 pl-6 text-[12px] leading-relaxed text-app-muted">{t(compat.bodyKey)}</p>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-app-border/70 bg-app-card shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-white/[0.05]">
        <div className="divide-y divide-app-border/60 px-5">
          {sport ? (
            <ProposalRow icon={sportEmoji} label={t("coach_proposal_label_sport")}>
              {sport}
            </ProposalRow>
          ) : null}
          {dateLabel ? (
            <ProposalRow icon="📅" label={t("coach_proposal_label_date")}>
              {dateLabel}
            </ProposalRow>
          ) : null}
          {timeLabel ? (
            <ProposalRow icon="🕒" label={t("coach_proposal_label_time")}>
              {timeLabel}
            </ProposalRow>
          ) : null}
          {place.trim() ? (
            <ProposalRow icon="📍" label={t("coach_proposal_label_place")}>
              {place.trim()}
            </ProposalRow>
          ) : null}
        </div>

        {message.trim() ? (
          <div className="border-t border-app-border/60 bg-app-bg/30 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
              💬 {t("coach_proposal_label_message")}
            </p>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-app-text/92">
              {message.trim()}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-app-border/70 bg-app-bg/25 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <input
            id="coach-priority"
            type="checkbox"
            checked={priorityEnabled}
            onChange={(e) => onPriorityChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF1E2D]"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="coach-priority" className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium leading-snug text-app-text">
                {t("coach_priority_label")}
              </span>
              <span
                className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                style={{ background: BRAND_BG, color: TEXT_ON_BRAND }}
              >
                {BADGE_PLUS_LABEL}
              </span>
              <button
                type="button"
                onClick={() => setPriorityInfoOpen((v) => !v)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold text-app-muted ring-1 ring-app-border transition hover:bg-app-border hover:text-app-text"
                aria-label={t("coach_priority_info_aria")}
                aria-expanded={priorityInfoOpen}
              >
                i
              </button>
            </label>
            {priorityInfoOpen ? (
              <p className="mt-2 text-[12px] leading-relaxed text-app-muted">{t("coach_priority_info")}</p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-2.5 pt-0.5">
        <button
          type="button"
          disabled={sending || !sport.trim()}
          onClick={onSubmit}
          className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold shadow-sm transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          style={{ backgroundColor: BRAND_BG, color: TEXT_ON_BRAND }}
        >
          {sending ? t("sending") : t("coach_send_proposal")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-2xl border border-app-border bg-app-card px-4 py-3.5 text-[15px] font-semibold text-app-text transition hover:bg-app-border active:scale-[0.99]"
        >
          {t("coach_edit_proposal")}
        </button>
      </div>
    </motion.div>
  );
}
