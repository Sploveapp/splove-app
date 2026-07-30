import { memo } from "react";
import type { SplovePlayIntentPresentation } from "../lib/splovePlay";

export type ReceivedPlayIntentCardProps = {
  presentation: SplovePlayIntentPresentation;
  className?: string;
};

/** Affiche toujours emoji + nom + description — jamais un cœur seul. */
export const ReceivedPlayIntentCard = memo(function ReceivedPlayIntentCard({
  presentation,
  className = "",
}: ReceivedPlayIntentCardProps) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${className}`}
      style={{
        borderColor: `rgba(${presentation.accentRgb}, 0.4)`,
        background: `linear-gradient(135deg, rgba(${presentation.accentRgb}, 0.14) 0%, rgba(24,24,27,0.92) 70%)`,
      }}
      role="status"
    >
      <p className="text-[15px] font-bold leading-snug text-app-text">
        <span aria-hidden>{presentation.emoji} </span>
        {presentation.title}
      </p>
      <p className="mt-1 text-[13px] font-medium leading-snug text-app-muted">
        {presentation.body}
      </p>
    </div>
  );
});
