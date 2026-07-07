import { motion, type MotionProps } from "framer-motion";
import type { SploveHeartVisual } from "../../lib/sploveHeartIntent";

/** Taille du cœur dans son conteneur. */
export const SPLOVE_HEART_MARK_SIZE_CLASS = "h-[71.02%] w-[71.02%]";

/** Conteneur par défaut pour SploveHeartMark. */
export const SPLOVE_HEART_MARK_CONTAINER_CLASS =
  `relative flex ${SPLOVE_HEART_MARK_SIZE_CLASS} items-center justify-center`;

export type SploveHeartMarkProps = {
  visual: SploveHeartVisual;
  /** Conteneur carré (ex. ~71 % du bouton). */
  className?: string;
  orbitKey?: string | number;
  heartKey?: string | number;
  orbitMotion?: MotionProps;
  heartMotion?: MotionProps;
  heartTransition?: MotionProps["transition"];
  orbitExtraClassName?: string;
  heartImgClassName?: string;
};

/** Icône cœur SPLove — sans anneau/orbite (intention uniquement). */
export function SploveHeartMark({
  visual,
  className = SPLOVE_HEART_MARK_CONTAINER_CLASS,
  heartKey,
  heartMotion,
  heartTransition,
  heartImgClassName = "",
}: SploveHeartMarkProps) {
  const heartClassName = `relative z-[1] h-full w-full select-none object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.32)] ${heartImgClassName}`;

  return (
    <span className={className}>
      {heartMotion ? (
        <motion.img
          key={heartKey}
          src={visual.imageUrl}
          alt=""
          draggable={false}
          className={heartClassName}
          {...heartMotion}
          transition={heartTransition ?? heartMotion.transition}
        />
      ) : (
        <img
          src={visual.imageUrl}
          alt=""
          draggable={false}
          className={heartClassName}
        />
      )}
    </span>
  );
}
