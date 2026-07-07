import { memo, useCallback, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SPLOVE_HEART_VISUALS,
  type SploveHeartIntent,
} from "../../lib/sploveHeartIntent";
import { triggerSploveHeartHaptic } from "../../lib/sploveHeartHaptic";
import { SploveHeartMark, SPLOVE_HEART_MARK_CONTAINER_CLASS } from "./SploveHeartMark";

const ORBIT_SPIN_MS = 520;
const HEART_SCALE_SPRING = { type: "spring" as const, stiffness: 420, damping: 22 };
const LONG_PRESS_MS = 380;

export type SploveHeartIntentButtonProps = {
  intent: SploveHeartIntent;
  label: string;
  description?: string;
  disabled?: boolean;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  onSelect: (intent: SploveHeartIntent) => void;
};

const SIZE_CLASS = {
  sm: "h-[2.35rem] w-[2.35rem]",
  md: "h-[2.65rem] w-[2.65rem] sm:h-[2.85rem] sm:w-[2.85rem]",
  lg: "h-[2.85rem] w-[2.85rem] sm:h-[3.05rem] sm:w-[3.05rem]",
} as const;

function heartButtonSurfaceStyle(glowRgb: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.2) 0%, rgba(12,16,28,0.94) 68%)`,
    boxShadow: `0 2px 14px rgba(${glowRgb}, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)`,
  };
}

export const SploveHeartIntentButton = memo(function SploveHeartIntentButton({
  intent,
  label,
  description,
  disabled = false,
  selected = false,
  size = "md",
  onSelect,
}: SploveHeartIntentButtonProps) {
  const visual = SPLOVE_HEART_VISUALS[intent];
  const [animKey, setAnimKey] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);
  const longPressRef = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    triggerSploveHeartHaptic(visual.premium);
    setAnimKey((k) => k + 1);
    setHintVisible(false);
    onSelect(intent);
  }, [disabled, intent, onSelect, visual.premium]);

  return (
    <div className="group relative flex flex-col items-center">
      <AnimatePresence>
        {hintVisible && description ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[2] w-max max-w-[9.5rem] -translate-x-1/2 rounded-lg bg-black/72 px-2 py-1 text-center text-[9px] font-medium leading-snug text-white/92 shadow-lg backdrop-blur-sm"
          >
            {description}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.stopPropagation();
          clearLongPress();
          longPressRef.current = window.setTimeout(() => setHintVisible(true), LONG_PRESS_MS);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          clearLongPress();
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          clearLongPress();
          setHintVisible(false);
        }}
        onPointerLeave={() => {
          clearLongPress();
          setHintVisible(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        aria-label={description ? `${label}. ${description}` : label}
        aria-pressed={selected}
        className="group/btn relative flex shrink-0 items-center justify-center rounded-full outline-none ring-1 ring-white/28 transition-opacity disabled:opacity-45"
        style={heartButtonSurfaceStyle(visual.glowRgb)}
        whileTap={disabled ? undefined : { scale: 0.94 }}
      >
        {visual.premium ? (
          <motion.span
            key={`glow-${animKey}`}
            aria-hidden
            className="pointer-events-none absolute inset-[-10px] rounded-full"
            initial={{ opacity: 0.35, scale: 0.88 }}
            animate={{ opacity: [0.35, 0.95, 0.45], scale: [0.88, 1.22, 1.02] }}
            transition={{ duration: 0.72, ease: "easeOut" }}
            style={{
              background: `radial-gradient(circle, rgba(${visual.glowRgb}, 0.55) 0%, rgba(${visual.glowRgb}, 0.12) 52%, transparent 72%)`,
              boxShadow: `0 0 28px rgba(${visual.glowRgb}, 0.55), 0 0 56px rgba(${visual.glowRgb}, 0.28)`,
            }}
          />
        ) : null}

        {selected ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[-3px] rounded-full ring-2 ring-white/55 ring-offset-1 ring-offset-transparent"
          />
        ) : null}

        <span className={`relative flex items-center justify-center ${SIZE_CLASS[size]}`}>
          <SploveHeartMark
            visual={visual}
            className={SPLOVE_HEART_MARK_CONTAINER_CLASS}
            orbitKey={`orbit-${animKey}`}
            heartKey={`heart-${animKey}`}
            orbitMotion={{
              initial: { rotate: 0, opacity: 0.85 },
              animate: { rotate: 360, opacity: [0.85, 1, 0.7] },
              transition: {
                rotate: { duration: ORBIT_SPIN_MS / 1000, ease: "easeInOut" },
                opacity: { duration: ORBIT_SPIN_MS / 1000 },
              },
            }}
            heartMotion={{
              initial: { scale: 1 },
              animate: { scale: [1, 1.14, 1] },
            }}
            heartTransition={HEART_SCALE_SPRING}
          />
        </span>

        {description ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 hidden w-max max-w-[8.5rem] -translate-x-1/2 rounded-md bg-black/65 px-1.5 py-0.5 text-center text-[8px] font-medium leading-tight text-white/80 opacity-0 shadow-md backdrop-blur-sm transition-opacity duration-150 group-hover/btn:opacity-100 md:block [@media(hover:hover)]:group-hover/btn:opacity-100"
          >
            {description}
          </span>
        ) : null}
      </motion.button>
    </div>
  );
});
