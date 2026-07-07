import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SPORT_PRACTICE_LEVELS,
  sportPracticeLevelI18nKey,
  type SportPracticeLevel,
  normalizeSportPracticeLevel,
} from "../../lib/sportPracticeLevel";
import { sportPictogramForSlug } from "../../lib/onboardingSportsQuickPick";
import { useTranslation } from "../../i18n/useTranslation";
import {
  APP_BORDER,
  APP_CARD,
  APP_TEXT,
  APP_TEXT_MUTED,
  BRAND_BG,
  TEXT_ON_BRAND,
} from "../../constants/theme";

export type SportLevelPickerSport = {
  id: string | number;
  name: string;
  slug?: string | null;
};

type Props = {
  sport: SportLevelPickerSport | null;
  currentLevel?: string | null;
  isAlreadySelected: boolean;
  onSelectLevel: (level: SportPracticeLevel) => void;
  onRemove: () => void;
  onClose: () => void;
};

export function SportLevelPickerSheet({
  sport,
  currentLevel,
  isAlreadySelected,
  onSelectLevel,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const open = sport != null;
  const normalizedLevel = normalizeSportPracticeLevel(currentLevel);
  const picto = sport ? sportPictogramForSlug(sport.slug ?? null) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && sport ? (
        <motion.div
          key="sport-level-sheet"
          className="fixed inset-0 z-[80] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sport-level-sheet-title"
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
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-app-border/90" aria-hidden />
            <div className="mb-4 flex items-center gap-2.5">
              {picto ? (
                <span className="text-[1.35rem] leading-none" aria-hidden>
                  {picto}
                </span>
              ) : null}
              <h2
                id="sport-level-sheet-title"
                className="text-[17px] font-semibold leading-snug text-app-text"
              >
                {t("sport_level_sheet_title", { sport: sport.name })}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {SPORT_PRACTICE_LEVELS.map((level) => {
                const active = normalizedLevel === level;
                return (
                  <motion.button
                    key={level}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelectLevel(level)}
                    className="rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-semibold transition-shadow"
                    style={{
                      borderColor: active ? BRAND_BG : APP_BORDER,
                      background: active ? BRAND_BG : APP_CARD,
                      color: active ? TEXT_ON_BRAND : APP_TEXT,
                    }}
                    aria-pressed={active}
                  >
                    {t(sportPracticeLevelI18nKey(level))}
                  </motion.button>
                );
              })}
            </div>
            {isAlreadySelected ? (
              <button
                type="button"
                onClick={onRemove}
                className="mt-4 w-full rounded-2xl border border-app-border bg-app-bg px-4 py-3 text-[14px] font-semibold text-app-muted"
              >
                {t("sport_level_sheet_remove", { sport: sport.name })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-2 text-center text-[13px] font-medium"
              style={{ color: APP_TEXT_MUTED }}
            >
              {t("cancel")}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
