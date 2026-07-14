import { memo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { APP_TEXT_MUTED, BRAND_BG } from "../../constants/theme";
import { SPLOVE_PLAY_META, SPLOVE_PLAY_PREMIUM_TYPES } from "../../lib/splovePlay";
import { useTranslation } from "../../i18n/useTranslation";
import { modalSheetHostClass } from "../../lib/nativeBottomNav";

export type SplovePlayIntroModalProps = {
  open: boolean;
  onDismiss: () => void;
};

export const SplovePlayIntroModal = memo(function SplovePlayIntroModal({
  open,
  onDismiss,
}: SplovePlayIntroModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss, open]);

  const goSplovePlus = useCallback(() => {
    onDismiss();
    navigate("/splove-plus");
  }, [navigate, onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="splove-play-intro"
          className={`fixed inset-0 z-[110] flex items-end justify-center ${modalSheetHostClass()}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="splove-play-intro-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={t("cancel")}
            onClick={onDismiss}
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
              id="splove-play-intro-title"
              className="text-center text-[18px] font-bold leading-snug text-app-text"
            >
              {t("splovePlay.introTitle")}
            </h2>
            <p className="mt-1.5 text-center text-[13px] font-medium leading-snug text-app-muted">
              {t("splovePlay.introSubtitle")}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2">
              {SPLOVE_PLAY_PREMIUM_TYPES.map((play) => {
                const meta = SPLOVE_PLAY_META[play];
                return (
                  <div
                    key={play}
                    className="flex items-start gap-3 rounded-2xl border border-app-border/80 bg-app-card/80 px-4 py-3"
                  >
                    <span className="text-[1.65rem] leading-none" aria-hidden>
                      {meta.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold leading-snug text-app-text">
                        {t(meta.titleKey)}
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium leading-snug text-app-muted">
                        « {t(meta.lineKey)} »
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goSplovePlus}
              className="mt-5 w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(255,30,45,0.28)] transition active:scale-[0.99]"
              style={{ background: BRAND_BG }}
            >
              {t("splovePlay.upsellPrimary")}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 w-full rounded-2xl py-2.5 text-center text-[13px] font-semibold"
              style={{ color: APP_TEXT_MUTED }}
            >
              {t("splovePlay.upsellSecondary")}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
});
