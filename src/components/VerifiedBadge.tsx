import { VERIFY_BADGE_LABEL } from "../constants/copy";

type Props = {
  /** Utiliser `compact` dans les listes denses (ex. suggestions). */
  variant?: "default" | "compact";
  className?: string;
};

/**
 * Badge discret « identité vérifiée » — affiché si `profiles.is_photo_verified` (ex. Veriff).
 */
export function VerifiedBadge({ variant = "default", className = "" }: Props) {
  const compact = variant === "compact";
  return (
    <span
      role="img"
      aria-label={VERIFY_BADGE_LABEL}
      title="Identité vérifiée"
      className={`inline-flex max-w-full items-center gap-0.5 rounded-full bg-emerald-500/12 font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-600/20 ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      } ${className}`}
    >
      <span className="text-emerald-600" aria-hidden>
        ✓
      </span>
      <span className="truncate">{compact ? "Vérifié" : VERIFY_BADGE_LABEL}</span>
    </span>
  );
}
