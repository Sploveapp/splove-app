import { memo } from "react";
import { motion } from "framer-motion";
import {
  SPLOVE_HEART_VISUALS,
  type SploveHeartIntent,
} from "../../lib/sploveHeartIntent";
import { SploveHeartMark, SPLOVE_HEART_MARK_CONTAINER_CLASS } from "./SploveHeartMark";

const ORBIT_SPIN_MS = 640;

export type SploveHeartCelebrationProps = {
  intent: SploveHeartIntent;
};

/** Cœur choisi au centre de la carte — feedback de satisfaction (~800 ms). */
export const SploveHeartCelebration = memo(function SploveHeartCelebration({
  intent,
}: SploveHeartCelebrationProps) {
  const visual = SPLOVE_HEART_VISUALS[intent];

  return (
    <motion.div
      key={intent}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center"
      style={{
        background: `radial-gradient(circle at center, rgba(${visual.glowRgb}, 0.22) 0%, rgba(0,0,0,0.38) 72%)`,
      }}
      aria-hidden
    >
      {visual.premium ? (
        <motion.span
          className="absolute h-44 w-44 rounded-full"
          initial={{ opacity: 0.4, scale: 0.7 }}
          animate={{ opacity: [0.4, 0.85, 0.5], scale: [0.7, 1.35, 1.1] }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            background: `radial-gradient(circle, rgba(${visual.glowRgb}, 0.5) 0%, transparent 68%)`,
            boxShadow: `0 0 48px rgba(${visual.glowRgb}, 0.45)`,
          }}
        />
      ) : null}

      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        <SploveHeartMark
          visual={visual}
          className={SPLOVE_HEART_MARK_CONTAINER_CLASS}
          orbitKey={`celebrate-orbit-${intent}`}
          heartKey={`celebrate-heart-${intent}`}
          orbitMotion={{
            initial: { rotate: 0, opacity: 0.9 },
            animate: { rotate: 360, opacity: 1 },
            transition: {
              rotate: { duration: ORBIT_SPIN_MS / 1000, ease: "easeInOut" },
              opacity: { duration: 0.2 },
            },
          }}
          heartMotion={{
            initial: { scale: 0.55, opacity: 0.6 },
            animate: { scale: [0.55, 1.16, 1], opacity: [0.6, 1, 1] },
            transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          heartImgClassName="drop-shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
          orbitExtraClassName="pointer-events-none absolute inset-[-8px] flex items-center justify-center"
        />
      </div>
    </motion.div>
  );
});
