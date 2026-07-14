import { memo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { APP_TEXT_MUTED } from "../../constants/theme";
import { useTranslation } from "../../i18n/useTranslation";
import { modalSheetHostClass } from "../../lib/nativeBottomNav";

export type SplovePlayUpsellSheetProps = {
  open: boolean;
  onClose: () => void;
};

export const SplovePlayUpsellSheet = memo(function SplovePlayUpsellSheet({
  open,
  onClose,
}: SplovePlayUpsellSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const goSplovePlus = useCallback(() => {
    onClose();
    navigate("/splove-plus");
  }, [navigate, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="splove-play-upsell"
          className={`fixed inset-0 z-[110] flex items-end justify-center ${modalSheetHostClass()}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="splove-play-upsell-title"
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
              id="splove-play-upsell-title"
              className="text-center text-[17px] font-bold leading-snug text-app-text"
            >
              {t("splovePlay.upsellTitle")}
            </h2>
            <p className="mt-2 text-center text-[13px] font-medium leading-snug text-app-muted">
              {t("splovePlay.upsellBody")}
            </p>
            <button
              type="button"
              onClick={goSplovePlus}
              className="mt-5 w-full rounded-2xl bg-[#FF1E2D] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(255,30,45,0.28)] transition active:scale-[0.99]"
            >
              {t("splovePlay.upsellPrimary")}
            </button>
            <button
              type="button"
              onClick={onClose}
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
