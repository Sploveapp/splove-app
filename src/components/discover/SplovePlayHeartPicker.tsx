import type { RefObject } from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  SPLOVE_PLAY_META,
  SPLOVE_PLAY_PREMIUM_TYPES,
  SPLOVE_PLAY_TYPES,
  type SplovePlayType,
} from "../../lib/splovePlay";
import { triggerSplovePlaySelectHaptic } from "../../lib/sploveHeartHaptic";
import { useTranslation } from "../../i18n/useTranslation";

/** Arc au-dessus du bouton Like (portal plein écran). */
const LIKE_FAN_ANGLES_DEG = [-158, -124, -90, -56, -22] as const;
const LIKE_FAN_RADIUS_PX = 76;

/**
 * Arc compact vers le haut, centré sur le bouton Play — évite Pass (gauche) et Like (droite).
 * Ordre aligné sur SPLOVE_PLAY_PREMIUM_TYPES : warmup, training, match, victory.
 */
const PHOTO_FAN_ANGLES_DEG = [-145, -115, -65, -90] as const;
const PHOTO_FAN_RADIUS_PX = 54;

const POP_MS = 130;

export type SplovePlayHeartPickerProps = {
  open: boolean;
  disabled?: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** Si défini, le picker reste dans ce conteneur (clippé par overflow-hidden photo). */
  containerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelect: (play: SplovePlayType) => void;
};

export const SplovePlayHeartPicker = memo(function SplovePlayHeartPicker({
  open,
  disabled = false,
  anchorRef,
  containerRef,
  onClose,
  onSelect,
}: SplovePlayHeartPickerProps) {
  const { t } = useTranslation();
  const contained = containerRef != null;
  const playTypes = contained ? SPLOVE_PLAY_PREMIUM_TYPES : SPLOVE_PLAY_TYPES;
  const fanAngles = contained ? PHOTO_FAN_ANGLES_DEG : LIKE_FAN_ANGLES_DEG;
  const fanRadius = contained ? PHOTO_FAN_RADIUS_PX : LIKE_FAN_RADIUS_PX;

  const [anchorCenter, setAnchorCenter] = useState<{ x: number; y: number } | null>(null);
  const [popping, setPopping] = useState<SplovePlayType | null>(null);
  const popTimerRef = useRef<number | null>(null);
  const pendingPlayRef = useRef<SplovePlayType | null>(null);

  const measureAnchor = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const container = containerRef?.current;
    if (container) {
      const cr = container.getBoundingClientRect();
      setAnchorCenter({
        x: rect.left - cr.left + rect.width / 2,
        y: rect.top - cr.top + rect.height / 2,
      });
      return;
    }
    setAnchorCenter({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [anchorRef, containerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setAnchorCenter(null);
      return;
    }
    measureAnchor();
    window.addEventListener("resize", measureAnchor);
    window.addEventListener("scroll", measureAnchor, true);
    return () => {
      window.removeEventListener("resize", measureAnchor);
      window.removeEventListener("scroll", measureAnchor, true);
    };
  }, [measureAnchor, open]);

  useEffect(() => {
    if (!open) {
      setPopping(null);
      pendingPlayRef.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (popTimerRef.current != null) window.clearTimeout(popTimerRef.current);
    },
    [],
  );

  const handlePick = useCallback(
    (play: SplovePlayType) => {
      if (disabled || popping) return;

      if (popTimerRef.current != null) {
        window.clearTimeout(popTimerRef.current);
      }

      pendingPlayRef.current = play;
      setPopping(play);
      triggerSplovePlaySelectHaptic();

      popTimerRef.current = window.setTimeout(() => {
        popTimerRef.current = null;
        const selected = pendingPlayRef.current;
        pendingPlayRef.current = null;
        setPopping(null);
        if (selected) onSelect(selected);
      }, POP_MS);
    },
    [disabled, onSelect, popping],
  );

  if (typeof document === "undefined" || !open || !anchorCenter) return null;

  const pickerUi = (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="splove-play-heart-backdrop"
            type="button"
            className={
              contained
                ? "absolute inset-0 z-[25] touch-none bg-transparent"
                : "fixed inset-0 z-[108] touch-none bg-transparent"
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label={t("cancel")}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          <motion.div
            key="splove-play-heart-picker"
            className={
              contained
                ? "pointer-events-none absolute z-[26] h-0 w-0"
                : "pointer-events-none fixed z-[109] h-0 w-0"
            }
            style={{ left: anchorCenter.x, top: anchorCenter.y }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {playTypes.map((play, index) => {
              const angleDeg = fanAngles[index] ?? -90;
              const angleRad = (angleDeg * Math.PI) / 180;
              const x = Math.cos(angleRad) * fanRadius;
              const y = Math.sin(angleRad) * fanRadius;
              const emoji = SPLOVE_PLAY_META[play].emoji;
              const isPopping = popping === play;
              const isCollapsed = popping != null && !isPopping;

              return (
                <motion.button
                  key={play}
                  type="button"
                  data-play-type={play}
                  disabled={disabled || popping != null}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.12 }}
                  animate={
                    isPopping
                      ? { x, y, opacity: 1, scale: [1, 1.2, 1] }
                      : isCollapsed
                        ? { x: 0, y: 0, opacity: 0, scale: 0.1 }
                        : { x, y, opacity: 1, scale: 1 }
                  }
                  exit={{ x: 0, y: 0, opacity: 0, scale: 0.12 }}
                  transition={
                    isPopping
                      ? { scale: { duration: POP_MS / 1000, ease: [0.34, 1.45, 0.64, 1] } }
                      : {
                          type: "spring",
                          stiffness: 520,
                          damping: 28,
                          delay: popping ? 0 : index * 0.03,
                        }
                  }
                  whileTap={disabled || popping ? undefined : { scale: 0.92 }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePick(play);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="pointer-events-auto absolute flex h-11 w-11 items-center justify-center bg-transparent text-[1.5rem] leading-none [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.42))_drop-shadow(0_0_1px_rgba(255,255,255,0.55))]"
                  style={{ marginLeft: -22, marginTop: -22 }}
                  aria-label={t(SPLOVE_PLAY_META[play].titleKey)}
                >
                  {emoji}
                </motion.button>
              );
            })}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );

  if (contained) {
    return pickerUi;
  }

  return createPortal(pickerUi, document.body);
});
