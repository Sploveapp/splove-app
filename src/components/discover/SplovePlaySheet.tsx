import { memo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { APP_BORDER, APP_CARD, APP_TEXT_MUTED, BRAND_BG } from "../../constants/theme";
import { triggerSploveHeartHaptic } from "../../lib/sploveHeartHaptic";
import {
  DEFAULT_SPLOVE_PLAY,
  SPLOVE_PLAY_META,
  SPLOVE_PLAY_PREMIUM_TYPES,
  type SplovePlayType,
} from "../../lib/splovePlay";
import { canSelectSplovePlay, type SplovePlayAccess } from "../../lib/splovePlayAccess";
import { useTranslation } from "../../i18n/useTranslation";
import { modalSheetHostClass } from "../../lib/nativeBottomNav";

export type SplovePlaySheetProps = {
  open: boolean;
  access: SplovePlayAccess;
  disabled?: boolean;
  onSelect: (play: SplovePlayType) => void | Promise<void>;
  onPremiumLocked: () => void;
  onClose: () => void;
};

export const SplovePlaySheet = memo(function SplovePlaySheet({
  open,
  access,
  disabled = false,
  onSelect,
  onPremiumLocked,
  onClose,
}: SplovePlaySheetProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const handleSelect = useCallback(
    (play: SplovePlayType) => {
      if (disabled) return;
      if (play === DEFAULT_SPLOVE_PLAY) {
        triggerSploveHeartHaptic(false);
        onClose();
        void onSelect(play);
        return;
      }
      if (!canSelectSplovePlay(play, access)) {
        onPremiumLocked();
        return;
      }
      triggerSploveHeartHaptic(play === "victory");
      onClose();
      void onSelect(play);
    },
    [access, disabled, onClose, onPremiumLocked, onSelect],
  );

  if (typeof document === "undefined") return null;

  const classicMeta = SPLOVE_PLAY_META[DEFAULT_SPLOVE_PLAY];

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="splove-play-sheet"
          className={`fixed inset-0 z-[100] flex items-end justify-center ${modalSheetHostClass()}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="splove-play-sheet-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={t("cancel")}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-lg rounded-t-[24px] border border-app-border/80 bg-app-card px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-2xl ring-1 ring-white/[0.05]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-app-border/90" aria-hidden />
            <h2
              id="splove-play-sheet-title"
              className="text-center text-[18px] font-bold leading-snug text-app-text"
            >
              {t("splovePlay.sheetTitle")}
            </h2>
            <p className="mt-1.5 text-center text-[13px] font-medium leading-snug text-app-muted">
              {t("splovePlay.sheetSubtitle")}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2.5">
              <motion.button
                type="button"
                disabled={disabled}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                whileTap={disabled ? undefined : { scale: 0.985 }}
                onClick={() => handleSelect(DEFAULT_SPLOVE_PLAY)}
                className="rounded-2xl border px-4 py-3.5 text-left transition-shadow"
                style={{
                  borderColor: `rgba(${classicMeta.accentRgb}, 0.45)`,
                  background: `linear-gradient(135deg, rgba(${classicMeta.accentRgb}, 0.12) 0%, ${APP_CARD} 72%)`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: BRAND_BG }}
                    aria-hidden
                  >
                    ❤️
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-app-text">
                      {t("splovePlay.classic.selectorTitle")}
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-emerald-300/90">
                      {t("splovePlay.classic.freeBadge")}
                    </p>
                  </div>
                </div>
              </motion.button>

              {SPLOVE_PLAY_PREMIUM_TYPES.map((play, index) => {
                const meta = SPLOVE_PLAY_META[play];
                const unlocked = canSelectSplovePlay(play, access);
                return (
                  <motion.button
                    key={play}
                    type="button"
                    disabled={disabled}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (index + 1) * 0.04, duration: 0.22 }}
                    whileTap={disabled ? undefined : { scale: 0.985 }}
                    onClick={() => handleSelect(play)}
                    className="relative rounded-2xl border px-4 py-3.5 text-left transition-shadow"
                    style={{
                      borderColor: unlocked ? `rgba(${meta.accentRgb}, 0.45)` : APP_BORDER,
                      background: unlocked
                        ? `linear-gradient(135deg, rgba(${meta.accentRgb}, 0.12) 0%, ${APP_CARD} 72%)`
                        : APP_CARD,
                      opacity: unlocked ? 1 : 0.92,
                    }}
                  >
                    {!unlocked ? (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/88 ring-1 ring-white/15">
                        <Lock size={10} aria-hidden />
                        {t("splovePlay.plusBadge")}
                      </span>
                    ) : null}
                    <div className="flex items-start gap-3">
                      <span className="text-[1.65rem] leading-none" aria-hidden>
                        {meta.emoji}
                      </span>
                      <div className="min-w-0 flex-1 pr-8">
                        <p className="text-[15px] font-bold leading-snug text-app-text">
                          {t(meta.titleKey)}
                        </p>
                        <p className="mt-1 text-[13px] font-medium leading-snug text-app-text/90">
                          « {t(meta.lineKey)} »
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-2xl py-2.5 text-center text-[13px] font-semibold"
              style={{ color: APP_TEXT_MUTED }}
            >
              {t("cancel")}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
});
