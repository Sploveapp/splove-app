import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DEFAULT_SPLOVE_HEART_INTENT,
  SPLOVE_HEART_INTENTS,
  SPLOVE_HEART_VISUALS,
  type SploveHeartIntent,
} from "../../lib/sploveHeartIntent";
import { SploveHeartIntentButton } from "./SploveHeartIntentButton";
import { SploveHeartMark, SPLOVE_HEART_MARK_SIZE_CLASS } from "./SploveHeartMark";
import { useTranslation } from "../../i18n/useTranslation";

export type SploveHeartPickerProps = {
  onSelect: (intent: SploveHeartIntent) => void | Promise<void>;
  disabled?: boolean;
};

const FAN_RADIUS = 94;
const FAN_OPEN_MS = 0.26;
const FAN_STAGGER = 0.035;

/** Arc en éventail (style réactions Messenger) — angle en degrés depuis le haut, négatif = gauche. */
const FAN_ARC: Record<SploveHeartIntent, { angle: number }> = {
  decouvrir: { angle: -74 },
  compatibles: { angle: -26 },
  ressemblent: { angle: 22 },
  coup_de_coeur: { angle: 70 },
};

function fanPolar(angleDeg: number, radius: number): { x: number; y: number; rotate: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * radius,
    y: -Math.cos(rad) * radius,
    rotate: angleDeg * 0.28,
  };
}

export const SploveHeartPicker = memo(function SploveHeartPicker({
  onSelect,
  disabled = false,
}: SploveHeartPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const handleSelect = useCallback(
    (intent: SploveHeartIntent) => {
      setOpen(false);
      void onSelect(intent);
    },
    [onSelect],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, open]);

  const triggerVisual = SPLOVE_HEART_VISUALS[DEFAULT_SPLOVE_HEART_INTENT];

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center justify-center">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="fan-scrim"
            className="pointer-events-none fixed inset-0 z-[28] bg-black/20 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FAN_OPEN_MS }}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open
          ? SPLOVE_HEART_INTENTS.map((intent, index) => {
              const { angle } = FAN_ARC[intent];
              const { x, y, rotate } = fanPolar(angle, FAN_RADIUS);
              const visual = SPLOVE_HEART_VISUALS[intent];
              return (
                <motion.div
                  key={intent}
                  className="pointer-events-auto absolute bottom-0 left-1/2 z-[29] -translate-x-1/2"
                  style={{ transformOrigin: "center bottom" }}
                  initial={{ opacity: 0, scale: 0.18, x: 0, y: 10, rotate: 0 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x,
                    y,
                    rotate,
                  }}
                  exit={{ opacity: 0, scale: 0.22, x: 0, y: 6, rotate: 0 }}
                  transition={{
                    duration: FAN_OPEN_MS,
                    delay: index * FAN_STAGGER,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <SploveHeartIntentButton
                    intent={intent}
                    label={t(visual.labelKey)}
                    description={t(visual.descriptionKey)}
                    size="sm"
                    onSelect={handleSelect}
                  />
                </motion.div>
              );
            })
          : null}
      </AnimatePresence>

      <motion.button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("sploveHeart.openPicker")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        whileTap={disabled ? undefined : { scale: 0.9 }}
        transition={{ type: "spring", stiffness: 460, damping: 24 }}
        className="relative z-[30] flex h-[3.65rem] w-[3.65rem] shrink-0 items-center justify-center rounded-full shadow-[0_4px_24px_rgba(59,158,255,0.38)] ring-2 ring-white/40 disabled:opacity-45"
        style={{
          background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.22) 0%, rgba(15,23,42,0.88) 68%)`,
        }}
      >
        <motion.div
          className={`flex ${SPLOVE_HEART_MARK_SIZE_CLASS} items-center justify-center`}
          animate={open ? { scale: 1.06 } : { scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <SploveHeartMark visual={triggerVisual} className="relative flex h-full w-full items-center justify-center" />
        </motion.div>
      </motion.button>
    </div>
  );
});
